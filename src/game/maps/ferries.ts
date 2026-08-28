/*
 * Ferry links — sea crossings between counties.
 *
 * Adjacency is derived from where county tiles touch, so every ordinary
 * neighbour is joined by land and needs no boat. What remains are the SEA
 * LINKS: pairs the tile map cannot join because the water between them is real
 * — Anglesey across the Menai Strait. Armies cross these with FerryArmy, the
 * only way to reach an island county.
 *
 * This used to be inferred — a declared neighbour with no land route between
 * its towns — which quietly turned map defects into ferry crossings. Cornwall
 * and Devon were "sea-separated" for exactly that reason. Now a ferry link is
 * something the design states, not something a broken coastline implies.
 */

import { britainAdjacency, isSeaLink } from './adjacency.ts';

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

let cached: Set<string> | null = null;

/** Set of canonical "a|b" county-id pairs reachable only by sea. */
export function ferryLinks(): Set<string> {
  if (cached) return cached;
  cached = new Set(
    britainAdjacency()
      .filter(([a, b]) => isSeaLink(a, b))
      .map(([a, b]) => pairKey(a, b)),
  );
  return cached;
}

/** Can an army sail directly between counties `a` and `b`? */
export function isFerryLink(a: string, b: string): boolean {
  return ferryLinks().has(pairKey(a, b));
}
