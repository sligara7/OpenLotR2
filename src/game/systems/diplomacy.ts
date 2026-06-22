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
import type { DiplomacyState, DiploProposal } from '../types/diplomacy.ts';
import type { GameState } from '../types/realm.ts';

/** A fresh, empty diplomatic slate. */
export function emptyDiplomacy(): DiplomacyState {
  return { opinions: {}, alliances: {}, enemies: {}, proposals: [] };
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
  if (!aggressorId || !victimId || aggressorId === victimId) {
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
  const becameEnemies = !before && areEnemies(state, aggressorId, victimId);
  return { doublecross: false, becameEnemies };
}

export interface DiplomacyLedger {
  /** Ids of alliance offers that expired unanswered this turn. */
  expiredProposals: string[];
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

  return { expiredProposals };
}
