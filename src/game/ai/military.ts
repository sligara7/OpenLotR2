/*
 * AI military maneuver — march a ruler's army toward the weakest county on its
 * border and live off it (foraging, from systems/foraging.ts, does the actual
 * damage). There is no combat/conquest yet, so this is raiding & pressure, not
 * invasion: the army drains an enemy's stores and ties down its food.
 *
 * Movement steps a few tiles along the pathfound route each turn rather than
 * teleporting, so it reads as a march and stays correct once movement points
 * land. Timid rulers (low aggression) keep their army at home.
 */

import { buildBritainTileMap, countyTowns, findTilePath } from '../maps/index.ts';
import { countiesOfRealm } from '../state/world.ts';
import type { GameState, Realm } from '../types/realm.ts';
import type { Command } from '../commands/types.ts';
import type { AiTraits } from './traits.ts';

/** Tiles an army advances along its route per turn (no movement points yet). */
export const AI_MARCH_TILES_PER_TURN = 3;

/** Pick the weakest non-owned county adjacent to the realm's territory. */
function weakestBorderTarget(state: GameState, realm: Realm): string | null {
  const owned = new Set(countiesOfRealm(state, realm.id).map((c) => c.id));
  let best: string | null = null;
  let bestPop = Infinity;
  for (const id of owned) {
    for (const nb of state.adjacency[id] ?? []) {
      if (owned.has(nb)) continue;
      const c = state.counties[nb];
      if (c && c.population < bestPop) { bestPop = c.population; best = nb; }
    }
  }
  return best;
}

/** Army-movement commands for this ruler (empty if it has no army, no target,
 *  or is too timid to march). */
export function planMilitary(state: GameState, realm: Realm, traits: AiTraits): Command[] {
  const armies = Object.values(state.armies).filter((a) => a.ownerId === realm.id);
  if (armies.length === 0 || traits.aggression < 0.3) return [];

  const targetId = weakestBorderTarget(state, realm);
  if (!targetId) return [];

  const map = buildBritainTileMap();
  const dest = countyTowns(map).get(targetId);
  if (!dest) return [];

  const cmds: Command[] = [];
  for (const army of armies) {
    const path = findTilePath(map, { col: army.col, row: army.row }, dest);
    if (!path || path.tiles.length < 2) continue; // already there / unreachable
    const step = path.tiles[Math.min(AI_MARCH_TILES_PER_TURN, path.tiles.length - 1)];
    if (step.col === army.col && step.row === army.row) continue;
    cmds.push({ type: 'MoveArmy', armyId: army.id, col: step.col, row: step.row });
  }
  return cmds;
}
