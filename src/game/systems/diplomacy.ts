/*
 * Diplomacy system — the standing between realms and how it shifts.
 *
 * Opinion is DIRECTIONAL (A's regard for B need not equal B's regard for A);
 * alliances and enemy status are SYMMETRIC. All mutation funnels through these
 * helpers so clamping, enemy-tipping and the symmetric keys stay consistent.
 *
 * `registerHostility` is the single choke point every aggressive act runs
 * through (field battle, siege, capture): it lowers the victim's regard, tips
 * the relationship into permanent enmity past a threshold, and — if the two
 * were allied — applies the manual's doublecross penalty (the betrayer is
 * trusted less by EVERYONE).
 */

import { DIPLOMACY } from '../constants.ts';
import { OpinionBand } from '../types/diplomacy.ts';
import type { DiplomacyState, DiploProposal, AllyRequest } from '../types/diplomacy.ts';
import type { GameState } from '../types/realm.ts';

/** A fresh, empty diplomatic slate. */
export function emptyDiplomacy(): DiplomacyState {
  return { opinions: {}, alliances: {}, enemies: {}, proposals: [], requests: [], recentCompliments: {} };
}

/** Tolerate states built before diplomacy existed (old saves / hand-made test
 *  fixtures): guarantee `state.diplomacy` is present, returning it. */
export function ensureDiplomacy(state: GameState): DiplomacyState {
  if (!state.diplomacy) state.diplomacy = emptyDiplomacy();
  const d = state.diplomacy;
  d.opinions ??= {};
  d.alliances ??= {};
  d.enemies ??= {};
  d.proposals ??= [];
  d.requests ??= [];
  d.recentCompliments ??= {};
  return d;
}

/** Canonical (order-independent) key for a symmetric relation between a and b. */
export function relKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function clampOpinion(v: number): number {
  return Math.max(DIPLOMACY.opinionMin, Math.min(DIPLOMACY.opinionMax, v));
}

/** How much `from` currently regards `to` (-100..+100; 0 if never set). */
export function opinionOf(state: GameState, from: string, to: string): number {
  return ensureDiplomacy(state).opinions[from]?.[to] ?? 0;
}

/** Set `from`'s regard for `to` to an exact (clamped) value; tips to enemy if low. */
export function setOpinion(state: GameState, from: string, to: string, value: number): number {
  const d = ensureDiplomacy(state);
  (d.opinions[from] ??= {})[to] = clampOpinion(value);
  if (d.opinions[from][to] <= DIPLOMACY.enemyThreshold) markEnemy(state, from, to);
  return d.opinions[from][to];
}

/** Nudge `from`'s regard for `to` by `delta`; returns the new value. */
export function adjustOpinion(state: GameState, from: string, to: string, delta: number): number {
  return setOpinion(state, from, to, opinionOf(state, from, to) + delta);
}

/** The colour band for a relationship bar. (Manual: red / blue / green.) */
export function opinionBand(value: number): OpinionBand {
  if (value >= DIPLOMACY.friendlyBand) return OpinionBand.Friendly;
  if (value <= -DIPLOMACY.friendlyBand) return OpinionBand.Hostile;
  return OpinionBand.Indifferent;
}

export function areAllied(state: GameState, a: string, b: string): boolean {
  return a !== b && relKey(a, b) in ensureDiplomacy(state).alliances;
}

export function areEnemies(state: GameState, a: string, b: string): boolean {
  return a !== b && relKey(a, b) in ensureDiplomacy(state).enemies;
}

/** Form an alliance (idempotent). Both sides warm to each other immediately. */
export function formAlliance(state: GameState, a: string, b: string): void {
  if (a === b || areEnemies(state, a, b)) return; // enemies can never ally
  const d = ensureDiplomacy(state);
  d.alliances[relKey(a, b)] = { since: state.turn };
  adjustOpinion(state, a, b, DIPLOMACY.allianceFormBonus);
  adjustOpinion(state, b, a, DIPLOMACY.allianceFormBonus);
}

/** Dissolve an alliance (idempotent). Returns true if one actually existed. */
export function breakAlliance(state: GameState, a: string, b: string): boolean {
  const d = ensureDiplomacy(state);
  const key = relKey(a, b);
  if (!(key in d.alliances)) return false;
  delete d.alliances[key];
  return true;
}

/** Mark two realms permanent enemies — an irreparable breach (Manual Part-7).
 *  Dissolves any alliance and floors both sides' regard. */
export function markEnemy(state: GameState, a: string, b: string): void {
  if (a === b) return;
  const d = ensureDiplomacy(state);
  d.enemies[relKey(a, b)] = true;
  breakAlliance(state, a, b);
}

/** Add a pending alliance offer (deduped on the same from/to/kind). */
export function addProposal(state: GameState, p: DiploProposal): void {
  const d = ensureDiplomacy(state);
  const dup = d.proposals.some(
    (q) => q.fromRealmId === p.fromRealmId && q.toRealmId === p.toRealmId && q.kind === p.kind,
  );
  if (!dup) d.proposals.push(p);
}

/** Remove a proposal by id (returns it if found). */
export function takeProposal(state: GameState, id: string): DiploProposal | undefined {
  const d = ensureDiplomacy(state);
  const i = d.proposals.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  return d.proposals.splice(i, 1)[0];
}

/** Add an ally request, replacing any prior request of the same kind between
 *  the same two realms (a new ask supersedes the old). */
export function addRequest(state: GameState, r: AllyRequest): void {
  const d = ensureDiplomacy(state);
  d.requests = d.requests.filter(
    (q) => !(q.fromRealmId === r.fromRealmId && q.toRealmId === r.toRealmId && q.kind === r.kind),
  );
  d.requests.push(r);
}

/** Standing requests addressed to `toRealmId` (from its allies). */
export function requestsTo(state: GameState, toRealmId: string): AllyRequest[] {
  return ensureDiplomacy(state).requests.filter((r) => r.toRealmId === toRealmId);
}

/** Would a compliment from `from` to `to` land sincerely (not backfire)?
 *  False while the cooldown since the last one is still in effect. */
export function complimentReady(state: GameState, from: string, to: string): boolean {
  const last = ensureDiplomacy(state).recentCompliments[`${from}>${to}`];
  return last === undefined || state.turn - last >= DIPLOMACY.complimentCooldown;
}

/** Record a compliment from `from` to `to`; returns whether it BACKFIRES
 *  (the same realm was complimented within the cooldown — empty flattery). */
export function noteCompliment(state: GameState, from: string, to: string): boolean {
  const d = ensureDiplomacy(state);
  const backfires = !complimentReady(state, from, to);
  d.recentCompliments[`${from}>${to}`] = state.turn;
  return backfires;
}

export interface HostilityResult {
  /** True if the aggressor betrayed a standing ally (a doublecross). */
  doublecross: boolean;
  /** True if this act tipped the pair into permanent enmity. */
  becameEnemies: boolean;
}

/**
 * Record an aggressive act by `aggressor` against `victim` (a field battle,
 * a siege, or a capture). Lowers the victim's regard for the aggressor and, if
 * the two were allied, applies the doublecross penalty: the betrayal is total
 * (victim → permanent enemy) and every OTHER realm trusts the betrayer less.
 *
 * Safe to call with equal ids or a missing diplomacy slate (no-op / lazily
 * initialised), so combat handlers can call it unconditionally.
 */
export function registerHostility(
  state: GameState,
  aggressorId: string,
  victimId: string,
): HostilityResult {
  if (!aggressorId) return { doublecross: false, becameEnemies: false };

  // NO VICTIM REALM — an unclaimed county taken, or land seized from a realm
  // already gone. There is nobody to be wronged, but the neighbours still watch
  // it happen, and on this map that is how MOST growth happens: 71 of Britain's
  // 82 counties begin unowned. Alarming third parties only over realm-on-realm
  // war would let a ruler swallow three quarters of the island unremarked,
  // which is exactly what was measured before this branch existed — a realm
  // grew from 4 counties to 81 and no survivor thought any worse of it.
  if (!victimId || aggressorId === victimId) {
    alarmThirdParties(state, aggressorId, victimId);
    return { doublecross: false, becameEnemies: false };
  }

  const wasAllied = areAllied(state, aggressorId, victimId);

  if (wasAllied) {
    // Betraying an ally: the victim is wronged beyond repair, and the wider
    // world marks the betrayer as untrustworthy.
    markEnemy(state, aggressorId, victimId);
    adjustOpinion(state, victimId, aggressorId, -DIPLOMACY.doublecrossVictimHit);
    for (const other of Object.keys(state.realms)) {
      if (other === aggressorId || other === victimId) continue;
      adjustOpinion(state, other, aggressorId, -DIPLOMACY.doublecrossReputationHit);
    }
    return { doublecross: true, becameEnemies: true };
  }

  const before = areEnemies(state, aggressorId, victimId);
  adjustOpinion(state, victimId, aggressorId, -DIPLOMACY.attackOpinionHit);

  // THE OVER-MIGHTY NEIGHBOUR. A war waged by a realm that already holds a
  // large share of the map alarms everyone still standing, not only the realm
  // it is waging it on. Below the threat share this is silent: two small
  // neighbours squabbling over a border is ordinary politics and no business of
  // anybody else's. Above it, alarm grows with the aggressor's holdings, so the
  // leader's next conquest costs it standing with every realm at once — which
  // is what lets the threatened find each other and combine.
  alarmThirdParties(state, aggressorId, victimId);

  const becameEnemies = !before && areEnemies(state, aggressorId, victimId);
  return { doublecross: false, becameEnemies };
}

/**
 * Apply the over-mighty neighbour's alarm to every realm not party to the act —
 * and draw the alarmed together.
 *
 * Both halves are needed. The first makes the leader everyone's problem; the
 * second is what turns a shared grievance into a league, because a coalition is
 * not several realms disliking the same man, it is those realms deciding they
 * prefer each other to him. Without it the alarm is measurable and useless: the
 * leader's standing fell to -21 while no alliance ever formed.
 *
 * The victim is drawn in too. Somebody just attacked by the strongest realm on
 * the island has more common cause with the other frightened than anyone.
 */
function alarmThirdParties(state: GameState, aggressorId: string, victimId: string): void {
  const alarm = threatAlarm(state, aggressorId);
  if (alarm <= 0) return;

  const alarmed: string[] = [];
  for (const other of Object.keys(state.realms)) {
    if (other === aggressorId) continue;
    if (state.realms[other]?.eliminated) continue;
    if (other !== victimId) adjustOpinion(state, other, aggressorId, -alarm);
    alarmed.push(other);
  }

  // Common cause: everyone who has reason to fear him warms to everyone else
  // who does. Applied both ways, since a league needs both parties willing.
  const bond = alarm * DIPLOMACY.commonCauseShare;
  if (bond <= 0) return;
  for (const a of alarmed) {
    for (const b of alarmed) {
      if (a === b) continue;
      if (areEnemies(state, a, b)) continue; // old blood outlasts new fear
      adjustOpinion(state, a, b, bond);
    }
  }
}

/**
 * How much an act of war by this realm alarms uninvolved third parties, from
 * the share of the map it holds. Zero below DIPLOMACY.threatShare, rising
 * linearly to DIPLOMACY.conquestAlarm at total dominion.
 *
 * Counts counties rather than armies on purpose: land is what neighbours can
 * see, and it is what a realm's future strength is actually made of.
 */
export function threatAlarm(state: GameState, realmId: string): number {
  const total = Object.keys(state.counties).length;
  if (total === 0) return 0;
  let held = 0;
  for (const c of Object.values(state.counties)) if (c.ownerId === realmId) held += 1;

  const share = held / total;
  const { threatShare, conquestAlarm } = DIPLOMACY;
  if (share <= threatShare) return 0;
  return conquestAlarm * ((share - threatShare) / (1 - threatShare));
}

export interface DiplomacyLedger {
  /** Ids of alliance offers that expired unanswered this turn. */
  expiredProposals: string[];
  /** Ids of ally requests that lapsed this turn. */
  expiredRequests: string[];
}

/**
 * World step: opinions drift back toward neutral each season (so insults and
 * favours fade), allies warm to one another, and stale offers expire. Run once
 * per turn from the engine. Enemy status, being permanent, never decays.
 */
export function runDiplomacy(state: GameState): DiplomacyLedger {
  const d = ensureDiplomacy(state);

  for (const from of Object.keys(d.opinions)) {
    for (const to of Object.keys(d.opinions[from])) {
      const allied = areAllied(state, from, to);
      const enemy = areEnemies(state, from, to);
      const cur = d.opinions[from][to];
      let next = cur;
      if (allied) {
        next = cur + DIPLOMACY.allianceWarmthPerTurn; // friends grow fonder
      } else if (!enemy) {
        // Decay toward 0 without overshooting.
        const step = Math.min(DIPLOMACY.opinionDecayPerTurn, Math.abs(cur));
        next = cur - Math.sign(cur) * step;
      }
      if (next !== cur) setOpinion(state, from, to, next);
    }
  }

  const expiredProposals: string[] = [];
  d.proposals = d.proposals.filter((p) => {
    if (state.turn - p.turn >= DIPLOMACY.proposalTtl) {
      expiredProposals.push(p.id);
      return false;
    }
    return true;
  });

  // Lapse stale ally requests, and any from/to a realm no longer allied.
  const expiredRequests: string[] = [];
  d.requests = d.requests.filter((r) => {
    if (state.turn - r.turn >= DIPLOMACY.requestTtl || !areAllied(state, r.fromRealmId, r.toRealmId)) {
      expiredRequests.push(r.id);
      return false;
    }
    return true;
  });

  // Forget compliment timestamps older than their cooldown (housekeeping).
  for (const key of Object.keys(d.recentCompliments)) {
    if (state.turn - d.recentCompliments[key] >= DIPLOMACY.complimentCooldown) delete d.recentCompliments[key];
  }

  return { expiredProposals, expiredRequests };
}
