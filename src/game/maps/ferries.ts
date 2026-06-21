/*
 * Ferry links — sea crossings between counties.
 *
 * The county adjacency graph (britain.ts) connects every region, but some
 * neighbours are separated by water, so tile pathfinding (land only) can't get
 * an army between them. A FERRY LINK is exactly such an edge: two adjacency
 * neighbours whose county towns are NOT joined by a land route. Armies cross
 * these by sea (FerryArmy), which is the only way to reach the sea-isolated
 * counties. Computed once from the static map and cached.
 */

import { BRITAIN } from './britain.ts';
import { buildBritainTileMap } from './britain-tiles.ts';
import { countyTowns } from './tiles.ts';
import { findTilePath } from './movement.ts';

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

let cached: Set<string> | null = null;

/** Set of canonical "a|b" county-id pairs reachable only by sea. */
export function ferryLinks(): Set<string> {
  if (cached) return cached;
  const map = buildBritainTileMap();
  const towns = countyTowns(map);
  const links = new Set<string>();

  for (const region of BRITAIN.regions) {
    const from = towns.get(region.id);
    if (!from) continue;
    for (const nb of region.neighbours) {
      const key = pairKey(region.id, nb);
      if (links.has(key)) continue;
      const to = towns.get(nb);
      if (!to) continue;
      // Adjacency neighbours with no land route between their towns ⇒ a sea hop.
      if (!findTilePath(map, from, to)) links.add(key);
    }
  }
  cached = links;
  return cached;
}

/** Can an army sail directly between counties `a` and `b`? */
export function isFerryLink(a: string, b: string): boolean {
  return ferryLinks().has(pairKey(a, b));
}
