/*
 * AI military maneuver & conquest. Each turn a ruler's army does the most
 * valuable thing available, in priority order:
 *   1. Besiege the enemy garrisoned castle it already occupies.
 *   2. Strike an adjacent enemy army it clearly outnumbers.
 *   3. March toward the weakest hostile county on its border — occupying an
 *      undefended town captures it outright (MoveArmy), and arriving on a
 *      garrisoned castle sets up next turn's siege (while foraging starves it).
 * Timid rulers (low aggression) keep their army at home.
 *
 * Pure planning: reads state, returns Commands. The planner emits at most one
 * command per army per turn, so behaviour stays legible.
 */

import { buildBritainTileMap, countyTowns, findTilePath, hexNeighbours, isFerryLink } from '../maps/index.ts';
import { countiesOfRealm } from '../state/world.ts';
import { areAllied, requestsTo } from '../systems/diplomacy.ts';
import { ARMED_UNITS, HAPPINESS, MIN_ARMY_SIZE } from '../constants.ts';
import { UnitType } from '../types/enums.ts';
import type { GameState, Realm } from '../types/realm.ts';
import type { Army } from '../types/army.ts';
import type { County } from '../types/county.ts';
import type { Command } from '../commands/types.ts';
import type { Rng } from '../rng.ts';
import type { AiTraits } from './traits.ts';

/** Numerical edge the AI wants before committing to a field battle. */
const ATTACK_CONFIDENCE = 1.2;
/** Edge the AI will gamble on when it "explores" instead of playing it safe. */
const ATTACK_GAMBLE = 0.9;
/** Exploration rate: how often the AI eschews the greedy choice for a different
 *  front or a riskier fight (exploration vs exploitation). Breaks the standoffs
 *  that arise when every realm always nibbles its single softest border. */
const EXPLORE_EPSILON = 0.3;
/** Army the AI wants to field scales with the realm: a bigger empire raises a
 *  bigger host (capped, so it never bankrupts itself on wages). */
const ARMY_PER_COUNTY = 8;
const MAX_ARMY_TARGET = 250;
/** Treasury the AI keeps in reserve before spending gold on mercenaries. */
const MERCENARY_GOLD_RESERVE = 300;

/** Difficulty nudges how large a host the AI tries to keep. */
const DIFFICULTY_HOST_MUL = { easy: 0.7, normal: 1, hard: 1.3 } as const;

/** The host size this realm aims to field, given how much land it holds. */
function targetArmySize(state: GameState, realm: Realm): number {
  const counties = countiesOfRealm(state, realm.id).length;
  const mul = DIFFICULTY_HOST_MUL[state.options?.difficulty ?? 'normal'];
  return Math.round(Math.min(MAX_ARMY_TARGET, MIN_ARMY_SIZE + counties * ARMY_PER_COUNTY) * mul);
}

/** Total soldiers a realm has under arms across all its armies. */
function totalSoldiers(state: GameState, realmId: string): number {
  let n = 0;
  for (const a of Object.values(state.armies)) if (a.ownerId === realmId) n += a.soldiers;
  return n;
}

/** Every non-owned, non-ally county bordering the realm, each with a softness
 *  score (lower = easier: small population, ungarrisoned). */
function borderTargets(state: GameState, realm: Realm): { id: string; score: number }[] {
  const owned = new Set(countiesOfRealm(state, realm.id).map((c) => c.id));
  const seen = new Set<string>();
  const out: { id: string; score: number }[] = [];
  for (const id of owned) {
    for (const nb of state.adjacency[id] ?? []) {
      if (owned.has(nb) || seen.has(nb)) continue;
      seen.add(nb);
      const c = state.counties[nb];
      if (!c) continue;
      // Never march on an ally's land (the "safer route" is to break the pact
      // first — handled elsewhere).
      if (c.ownerId && areAllied(state, realm.id, c.ownerId)) continue;
      out.push({ id: nb, score: c.population + c.castle.garrison * 10 });
    }
  }
  return out;
}

/**
 * Choose a county to march on. EXPLOIT (the common case): the softest border —
 * the greedy pick. EXPLORE (with EXPLORE_EPSILON): a random border instead, so
 * the realm commits to a fresh front rather than forever oscillating toward
 * whichever single county happens to be weakest this turn. The randomness draws
 * from the seeded game RNG, so games stay deterministic; without an RNG (unit
 * tests) the choice is the deterministic greedy one.
 */
function chooseBorderTarget(state: GameState, realm: Realm, rng?: Rng): string | null {
  const targets = borderTargets(state, realm);
  if (targets.length === 0) return null;
  if (rng && rng.chance(EXPLORE_EPSILON)) {
    return targets[rng.int(0, targets.length - 1)].id;
  }
  return targets.reduce((a, b) => (b.score < a.score ? b : a)).id;
}

/** An enemy army within reach (same or adjacent tile) of `army`, if any. */
function enemyInReach(state: GameState, army: Army): Army | null {
  const adj = new Set(hexNeighbours(army.col, army.row).map(([c, r]) => `${c},${r}`));
  for (const other of Object.values(state.armies)) {
    if (other.ownerId === army.ownerId) continue;
    if (other.ownerId && areAllied(state, army.ownerId, other.ownerId)) continue;
    const same = other.col === army.col && other.row === army.row;
    if (same || adj.has(`${other.col},${other.row}`)) return other;
  }
  return null;
}

/** A county an ally has asked this realm to march on (attack) or shore up
 *  (defend), if any — honoured over the realm's own border ambitions. */
function requestedTarget(state: GameState, realm: Realm, traits: AiTraits): string | null {
  const reqs = requestsTo(state, realm.id);
  // Defence comes first — an ally in trouble is worth the detour. Attacks need
  // a ruler with at least some appetite for war.
  const defend = reqs.find((r) => r.kind === 'defend' && state.counties[r.countyId]);
  if (defend) return defend.countyId;
  if (traits.aggression < 0.3) return null;
  const attack = reqs.find(
    (r) => r.kind === 'attack' && state.counties[r.countyId] && state.counties[r.countyId].ownerId !== realm.id,
  );
  return attack ? attack.countyId : null;
}

/** One command for this army (siege / attack / march), or null to stand fast. */
function planArmy(state: GameState, realm: Realm, army: Army, traits: AiTraits, rng?: Rng): Command | null {
  const county = army.countyId ? state.counties[army.countyId] : undefined;

  // 1. Besiege a garrisoned enemy castle we already sit on (never an ally's).
  if (county && county.ownerId && county.ownerId !== realm.id && county.castle.garrison > 0
      && !areAllied(state, realm.id, county.ownerId)) {
    return { type: 'LaySiege', armyId: army.id, countyId: county.id };
  }

  // 2. Strike an adjacent enemy army. EXPLOIT: only with a clear edge. EXPLORE:
  // occasionally gamble on a closer fight, which breaks the frozen standoffs
  // that form when two evenly-matched hosts each wait for an advantage.
  const foe = enemyInReach(state, army);
  if (foe) {
    const edge = rng && rng.chance(EXPLORE_EPSILON) ? ATTACK_GAMBLE : ATTACK_CONFIDENCE;
    if (army.soldiers > foe.soldiers * edge) {
      return { type: 'AttackArmy', armyId: army.id, targetArmyId: foe.id };
    }
  }

  // 3. March on an ally's requested target if there is one, else a border county
  // (greedy-softest, or — when exploring — a fresh front). The move handler
  // advances as far as movement allows and captures an undefended town on arrival.
  if (army.movement <= 0) return null;
  const targetId = requestedTarget(state, realm, traits) ?? chooseBorderTarget(state, realm, rng);
  if (!targetId) return null;
  const map = buildBritainTileMap();
  const dest = countyTowns(map).get(targetId);
  if (!dest) return null;
  const path = findTilePath(map, { col: army.col, row: army.row }, dest);
  if (path && path.tiles.length >= 2) {
    return { type: 'MoveArmy', armyId: army.id, col: dest.col, row: dest.row };
  }
  // No land route: sail there if it is a ferry crossing from where we stand.
  if (army.countyId && isFerryLink(army.countyId, targetId)) {
    return { type: 'FerryArmy', armyId: army.id, toCountyId: targetId };
  }
  return null; // already there, or unreachable this turn

}

/** Most peasants a county can draft this turn without driving morale below half
 *  (a margin shy of the hard floor the conscription command enforces). */
function safeLevy(county: County, want: number): number {
  const headroom = (county.happiness * 0.5) / HAPPINESS.conscriptionPenaltyPerPct; // allowable % of pop
  const byMorale = Math.floor((headroom / 100) * county.population) - county.recentConscription;
  return Math.max(0, Math.min(want, byMorale, county.population - 1));
}

/**
 * Keep the war machine fed: forge a weapon the realm can supply, and top up any
 * home army below strength with a peasant levy. Runs before maneuvers so fresh
 * recruits march out the same turn.
 */
export function planReinforce(state: GameState, realm: Realm): Command[] {
  const cmds: Command[] = [];
  const owned = countiesOfRealm(state, realm.id);
  if (owned.length === 0) return cmds;

  // Forge at the capital whatever the realm has the materials for.
  const capital = owned[0];
  const hasIron = owned.some((c) => c.industries.IronMine.present);
  const hasWood = owned.some((c) => c.industries.Lumber.present);
  const product = hasIron ? UnitType.Swordsman : hasWood ? UnitType.Archer : null;
  if (product && capital.blacksmithProduct !== product) {
    cmds.push({ type: 'SetBlacksmith', countyId: capital.id, product });
  }

  // The best-stocked weapon in the armory — the AI arms recruits with it when it
  // can, otherwise raises a free peasant levy.
  let armed: UnitType | null = null;
  let stock = 0;
  for (const u of ARMED_UNITS) {
    const have = realm.treasury.weapons[u] ?? 0;
    if (have > stock) { stock = have; armed = u; }
  }
  const draftUnit = (n: number): { unit: UnitType; count: number } => {
    if (armed && stock > 0) { const count = Math.min(n, stock); stock -= count; return { unit: armed, count }; }
    return { unit: UnitType.Peasant, count: n };
  };

  const target = targetArmySize(state, realm);
  const armies = Object.values(state.armies).filter((a) => a.ownerId === realm.id);

  // A realm that has lost its host raises a fresh one at the capital.
  if (armies.length === 0) {
    const start = Math.min(target, safeLevy(capital, target));
    if (start >= MIN_ARMY_SIZE) {
      const { unit, count } = draftUnit(start);
      cmds.push({ type: 'Conscript', countyId: capital.id, unit, count });
    }
    return cmds;
  }

  // Reinforce each under-strength army standing on friendly soil toward the
  // (size-scaled) target.
  for (const army of armies) {
    if (army.soldiers >= target) continue;
    const county = army.countyId ? state.counties[army.countyId] : undefined;
    if (!county || county.ownerId !== realm.id) continue;
    const levy = safeLevy(county, target - army.soldiers);
    if (levy <= 0) continue;
    const { unit, count } = draftUnit(levy);
    cmds.push({ type: 'Conscript', countyId: county.id, unit, count, armyId: army.id });
  }

  // When conscription can't keep pace and the coffers are deep, hire a mercenary
  // band — they cost no people or morale, only gold.
  if (totalSoldiers(state, realm.id) < target - MIN_ARMY_SIZE
      && realm.treasury.gold > MERCENARY_GOLD_RESERVE && armies.length < 4) {
    cmds.push({ type: 'HireMercenaries', countyId: capital.id, unit: UnitType.Swordsman, count: MIN_ARMY_SIZE });
  }
  return cmds;
}

/** All military commands for this ruler (empty if too timid or armyless). The
 *  seeded `rng`, when supplied, drives the AI's exploration-vs-exploitation
 *  choices; without it the AI plays the deterministic greedy line. */
export function planMilitary(state: GameState, realm: Realm, traits: AiTraits, rng?: Rng): Command[] {
  if (traits.aggression < 0.3) return [];
  const cmds: Command[] = [];
  for (const army of Object.values(state.armies)) {
    if (army.ownerId !== realm.id) continue;
    const cmd = planArmy(state, realm, army, traits, rng);
    if (cmd) cmds.push(cmd);
  }
  return cmds;
}
