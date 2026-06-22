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

/** Total soldiers a realm has under arms across all its armies. */
function military(state: GameState, realmId: string): number {
  let n = 0;
  for (const a of Object.values(state.armies)) if (a.ownerId === realmId) n += a.soldiers;
  return n;
}

/** Living rivals (every other realm still in the game). */
function rivals(state: GameState, realm: Realm): Realm[] {
  return Object.values(state.realms).filter((r) => r.id !== realm.id && !r.eliminated);
}

/** How agreeable this ruler is to alliances — diplomats settle for less regard. */
function acceptThreshold(traits: AiTraits): number {
  // diplomacy 1.0 -> half the base bar; 0.0 -> double it (effectively never).
  return DIPLOMACY.allianceMinOpinion * (2 - 1.5 * traits.diplomacy);
}

/** Answer every alliance offer addressed to this realm. */
function answerProposals(state: GameState, realm: Realm, traits: AiTraits): Command[] {
  const cmds: Command[] = [];
  const bar = acceptThreshold(traits);
  for (const p of state.diplomacy?.proposals ?? []) {
    if (p.toRealmId !== realm.id) continue;
    const accept =
      traits.diplomacy > 0.15 &&
      !areEnemies(state, realm.id, p.fromRealmId) &&
      opinionOf(state, realm.id, p.fromRealmId) >= bar;
    cmds.push({ type: 'RespondToAlliance', proposalId: p.id, accept });
  }
  return cmds;
}

/** One proactive overture: court a friend, or appease a threat. */
function overture(state: GameState, realm: Realm, traits: AiTraits): Command | null {
  if (traits.diplomacy < 0.2) return null; // the Knight keeps his own counsel
  const others = rivals(state, realm);
  if (others.length === 0) return null;

  const ownStrength = military(state, realm.id);
  const pending = (to: string): boolean =>
    (state.diplomacy?.proposals ?? []).some(
      (p) => p.fromRealmId === realm.id && p.toRealmId === to,
    );

  // Court the realm we trust most that we're not already tied to — alliances
  // multiply our weight against the rest of the field.
  const friend = others
    .filter((r) => !areAllied(state, realm.id, r.id) && !areEnemies(state, realm.id, r.id) && !pending(r.id))
    .sort((a, b) => opinionOf(state, realm.id, b.id) - opinionOf(state, realm.id, a.id))[0];
  if (friend && opinionOf(state, realm.id, friend.id) >= acceptThreshold(traits)) {
    return { type: 'OfferAlliance', toRealmId: friend.id };
  }

  // Outmatched? Buy goodwill from the strongest rival who isn't already a friend,
  // so they are likelier to look elsewhere for conquest.
  const threat = others
    .filter((r) => !areAllied(state, realm.id, r.id))
    .sort((a, b) => military(state, b.id) - military(state, a.id))[0];
  if (threat && military(state, threat.id) > ownStrength * 1.3) {
    const standing = opinionOf(state, threat.id, realm.id);
    if (standing < DIPLOMACY.friendlyBand) {
      // Gold talks if the coffers allow; otherwise flattery — but only when it
      // won't backfire (the manual warns against laying it on too thick).
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

/** All diplomatic commands for this ruler this turn. */
export function planDiplomacy(state: GameState, realm: Realm, traits: AiTraits): Command[] {
  if (countiesOfRealm(state, realm.id).length === 0) return [];
  const cmds = answerProposals(state, realm, traits);
  const move = overture(state, realm, traits);
  if (move) cmds.push(move);
  return cmds;
}
