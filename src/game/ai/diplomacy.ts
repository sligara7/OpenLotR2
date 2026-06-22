/*
 * AI diplomacy. Each turn a ruler, according to its taste for statecraft:
 *   1. Answers any alliance offers sitting in its inbox (accepts realms it
 *      likes and isn't sworn against; otherwise declines).
 *   2. Makes ONE proactive overture — either an alliance offer to a realm it
 *      already trusts, or, if it is outmatched, a gift/compliment to soften the
 *      strongest rival so they are less inclined to attack.
 *
 * Pure planning: reads state, returns Commands (applied later through dispatch,
 * so the AI obeys the same validation as a human). The Knight, "no statesman",
 * largely abstains; the Countess, a master of diplomacy, works the room.
 */

import { DIPLOMACY } from '../constants.ts';
import { areAllied, areEnemies, complimentReady, opinionOf } from '../systems/diplomacy.ts';
import { countiesOfRealm } from '../state/world.ts';
import type { GameState, Realm } from '../types/realm.ts';
import type { Command } from '../commands/types.ts';
import type { AiTraits } from './traits.ts';

/** A realm holding at least this multiple of your land counts as a "leader"
 *  worth balancing against — the trigger for underdog alliances. */
const LEADER_FACTOR = 1.3;

/** Total soldiers a realm has under arms across all its armies. */
function military(state: GameState, realmId: string): number {
  let n = 0;
  for (const a of Object.values(state.armies)) if (a.ownerId === realmId) n += a.soldiers;
  return n;
}

/** Counties a realm holds. */
function landOf(state: GameState, realmId: string): number {
  return countiesOfRealm(state, realmId).length;
}

/** Living rivals (every other realm still in the game). */
function rivals(state: GameState, realm: Realm): Realm[] {
  return Object.values(state.realms).filter((r) => r.id !== realm.id && !r.eliminated);
}

/** The realm holding the most counties (the board leader), among the living. */
function leaderId(state: GameState): string | null {
  let best: string | null = null;
  let bestLand = -1;
  for (const r of Object.values(state.realms)) {
    if (r.eliminated) continue;
    const land = landOf(state, r.id);
    if (land > bestLand) { bestLand = land; best = r.id; }
  }
  return best;
}

/** Is `realm` outmatched on the board by a leader other than itself? */
function threatenedByLeader(state: GameState, realm: Realm): string | null {
  const lead = leaderId(state);
  if (!lead || lead === realm.id) return null;
  return landOf(state, lead) >= Math.max(1, landOf(state, realm.id)) * LEADER_FACTOR ? lead : null;
}

/** How agreeable this ruler is to alliances on opinion alone — diplomats settle
 *  for less regard. */
function acceptThreshold(traits: AiTraits): number {
  return DIPLOMACY.allianceMinOpinion * (2 - 1.5 * traits.diplomacy);
}

/** Answer every alliance offer addressed to this realm. Beyond raw goodwill, an
 *  underdog accepts a pact against a common, dominant leader from a cold start. */
function answerProposals(state: GameState, realm: Realm, traits: AiTraits): Command[] {
  const cmds: Command[] = [];
  const bar = acceptThreshold(traits);
  const lead = threatenedByLeader(state, realm);
  for (const p of state.diplomacy?.proposals ?? []) {
    if (p.toRealmId !== realm.id) continue;
    const liked = opinionOf(state, realm.id, p.fromRealmId) >= bar;
    // Unite against a common threat: the proposer isn't the leader, and a third
    // party towers over us both.
    const commonCause = lead !== null && lead !== p.fromRealmId;
    const accept = traits.diplomacy > 0.15 && !areEnemies(state, realm.id, p.fromRealmId) && (liked || commonCause);
    cmds.push({ type: 'RespondToAlliance', proposalId: p.id, accept });
  }
  return cmds;
}

/** One proactive overture: rally against the leader, court a friend, or appease. */
function overture(state: GameState, realm: Realm, traits: AiTraits): Command | null {
  if (traits.diplomacy < 0.2) return null; // the Knight keeps his own counsel
  const others = rivals(state, realm);
  if (others.length === 0) return null;

  const pending = (to: string): boolean =>
    (state.diplomacy?.proposals ?? []).some((p) => p.fromRealmId === realm.id && p.toRealmId === to);
  const eligible = (r: Realm): boolean =>
    !areAllied(state, realm.id, r.id) && !areEnemies(state, realm.id, r.id) && !pending(r.id);

  // 1. A leader is running away with the board — rally a fellow underdog against
  // them (the strongest one we can still treat with). Works from a cold start.
  const lead = threatenedByLeader(state, realm);
  if (lead) {
    const partner = others
      .filter((r) => r.id !== lead && eligible(r))
      .sort((a, b) => landOf(state, b.id) - landOf(state, a.id))[0];
    if (partner) return { type: 'OfferAlliance', toRealmId: partner.id };
  }

  // 2. Otherwise court the realm we already trust most.
  const friend = others.filter(eligible).sort((a, b) => opinionOf(state, realm.id, b.id) - opinionOf(state, realm.id, a.id))[0];
  if (friend && opinionOf(state, realm.id, friend.id) >= acceptThreshold(traits)) {
    return { type: 'OfferAlliance', toRealmId: friend.id };
  }

  // 3. Outmatched in arms? Buy goodwill from the strongest rival so they look
  // elsewhere for conquest.
  const ownStrength = military(state, realm.id);
  const threat = others
    .filter((r) => !areAllied(state, realm.id, r.id))
    .sort((a, b) => military(state, b.id) - military(state, a.id))[0];
  if (threat && military(state, threat.id) > ownStrength * 1.3) {
    const standing = opinionOf(state, threat.id, realm.id);
    if (standing < DIPLOMACY.friendlyBand) {
      if (realm.treasury.gold > 300 && traits.diplomacy >= 0.5) {
        return { type: 'SendGift', toRealmId: threat.id, gold: 150 };
      }
      if (complimentReady(state, realm.id, threat.id)) {
        return { type: 'SendCompliment', toRealmId: threat.id };
      }
    }
  }
  return null;
}

/** Shed alliances that have outlived their purpose (Manual Part-7: "in the end
 *  there is only one winner"). An ally is dropped — the honourable way, before
 *  any attack — once we dominate the board (time to pursue the crown) or once
 *  that ally has itself become the runaway leader (now our chief threat). */
function reconsiderAlliances(state: GameState, realm: Realm): Command[] {
  const lead = leaderId(state);
  const myLand = landOf(state, realm.id);
  const cmds: Command[] = [];
  for (const r of rivals(state, realm)) {
    if (!areAllied(state, realm.id, r.id)) continue;
    const iDominate = lead === realm.id && myLand >= landOf(state, r.id) * LEADER_FACTOR;
    const allyLeads = lead === r.id && landOf(state, r.id) >= myLand * LEADER_FACTOR;
    if (iDominate || allyLeads) cmds.push({ type: 'BreakAlliance', withRealmId: r.id });
  }
  return cmds;
}

/** All diplomatic commands for this ruler this turn. */
export function planDiplomacy(state: GameState, realm: Realm, traits: AiTraits): Command[] {
  if (countiesOfRealm(state, realm.id).length === 0) return [];
  const cmds = answerProposals(state, realm, traits);
  cmds.push(...reconsiderAlliances(state, realm));
  const move = overture(state, realm, traits);
  if (move) cmds.push(move);
  return cmds;
}
