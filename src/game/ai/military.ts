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

import { buildBritainTileMap, countyTowns, findTilePath, hexNeighbours } from '../maps/index.ts';
import { countiesOfRealm } from '../state/world.ts';
import { ARMED_UNITS, HAPPINESS, MIN_ARMY_SIZE } from '../constants.ts';
import { UnitType } from '../types/enums.ts';
import type { GameState, Realm } from '../types/realm.ts';
import type { Army } from '../types/army.ts';
import type { County } from '../types/county.ts';
import type { Command } from '../commands/types.ts';
import type { AiTraits } from './traits.ts';

/** Tiles an army advances along its route per turn (no movement points yet). */
export const AI_MARCH_TILES_PER_TURN = 3;
/** Numerical edge the AI wants before committing to a field battle. */
const ATTACK_CONFIDENCE = 1.2;
/** Army size the AI tops its forces back up to (the minimum legal army). */
const REINFORCE_TARGET = MIN_ARMY_SIZE;

/** Pick the weakest non-owned county adjacent to the realm's territory. */
function weakestBorderTarget(state: GameState, realm: Realm): string | null {
  const owned = new Set(countiesOfRealm(state, realm.id).map((c) => c.id));
  let best: string | null = null;
  let bestScore = Infinity;
  for (const id of owned) {
    for (const nb of state.adjacency[id] ?? []) {
      if (owned.has(nb)) continue;
      const c = state.counties[nb];
      if (!c) continue;
      // Prefer soft targets: small population, and undefended over garrisoned.
      const score = c.population + c.castle.garrison * 10;
      if (score < bestScore) { bestScore = score; best = nb; }
    }
  }
  return best;
}

/** An enemy army within reach (same or adjacent tile) of `army`, if any. */
function enemyInReach(state: GameState, army: Army): Army | null {
  const adj = new Set(hexNeighbours(army.col, army.row).map(([c, r]) => `${c},${r}`));
  for (const other of Object.values(state.armies)) {
    if (other.ownerId === army.ownerId) continue;
    const same = other.col === army.col && other.row === army.row;
    if (same || adj.has(`${other.col},${other.row}`)) return other;
  }
  return null;
}

/** One command for this army (siege / attack / march), or null to stand fast. */
function planArmy(state: GameState, realm: Realm, army: Army): Command | null {
  const county = army.countyId ? state.counties[army.countyId] : undefined;

  // 1. Besiege a garrisoned enemy castle we already sit on.
  if (county && county.ownerId && county.ownerId !== realm.id && county.castle.garrison > 0) {
    return { type: 'LaySiege', armyId: army.id, countyId: county.id };
  }

  // 2. Smash an adjacent enemy army we clearly outnumber.
  const foe = enemyInReach(state, army);
  if (foe && army.soldiers > foe.soldiers * ATTACK_CONFIDENCE) {
    return { type: 'AttackArmy', armyId: army.id, targetArmyId: foe.id };
  }

  // 3. March on the weakest border county (captures it if undefended on arrival).
  const targetId = weakestBorderTarget(state, realm);
  if (!targetId) return null;
  const map = buildBritainTileMap();
  const dest = countyTowns(map).get(targetId);
  if (!dest) return null;
  const path = findTilePath(map, { col: army.col, row: army.row }, dest);
  if (!path || path.tiles.length < 2) return null; // already there / unreachable
  const step = path.tiles[Math.min(AI_MARCH_TILES_PER_TURN, path.tiles.length - 1)];
  if (step.col === army.col && step.row === army.row) return null;
  return { type: 'MoveArmy', armyId: army.id, col: step.col, row: step.row };
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

  // Reinforce under-strength armies standing on friendly soil.
  for (const army of Object.values(state.armies)) {
    if (army.ownerId !== realm.id || army.soldiers >= REINFORCE_TARGET) continue;
    const county = army.countyId ? state.counties[army.countyId] : undefined;
    if (!county || county.ownerId !== realm.id) continue;
    const levy = safeLevy(county, REINFORCE_TARGET - army.soldiers);
    if (levy <= 0) continue;
    const unit = armed && stock > 0 ? armed : UnitType.Peasant;
    const count = unit === UnitType.Peasant ? levy : Math.min(levy, stock);
    cmds.push({ type: 'Conscript', countyId: county.id, unit, count, armyId: army.id });
    if (unit !== UnitType.Peasant) stock -= count; // don't promise the same swords twice
  }
  return cmds;
}

/** All military commands for this ruler (empty if too timid or armyless). */
export function planMilitary(state: GameState, realm: Realm, traits: AiTraits): Command[] {
  if (traits.aggression < 0.3) return [];
  const cmds: Command[] = [];
  for (const army of Object.values(state.armies)) {
    if (army.ownerId !== realm.id) continue;
    const cmd = planArmy(state, realm, army);
    if (cmd) cmds.push(cmd);
  }
  return cmds;
}
