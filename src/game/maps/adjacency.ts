/*
 * County adjacency, derived from the map rather than declared.
 *
 * Two counties are neighbours because their TILES TOUCH. That is the only
 * definition that cannot drift: the hand-written neighbour lists in `britain.ts`
 * were drawn against a map whose coastline was a union of circles, so a fifth of
 * them disagree with the ground the game now stands on — some claiming borders
 * that no longer meet, others missing borders that do.
 *
 * Land contact alone is not the whole graph, though. Anglesey touches nothing,
 * and a county nothing borders is a county no army can reach, so a short list of
 * SEA LINKS is carried explicitly. Those are the ferry crossings: adjacency the
 * map cannot show because the water is real.
 *
 * The declared lists stay in `britain.ts` — as a CHECK, not as the source of
 * truth. `adjacencyDrift()` reports where the two disagree, which is what
 * catches a coastline change that accidentally severs the realm.
 */

import { BRITAIN } from './britain.ts';
import { buildBritainTileMap } from './britain-tiles.ts';
import { hexNeighbours, type TileMap } from './tiles.ts';
import { mapEdges } from './types.ts';

/**
 * Crossings the tile map cannot express, because the water is narrower than a
 * hex or the county is an island. Kept deliberately short — everything else
 * comes from the ground.
 */
const SEA_LINKS: readonly (readonly [string, string])[] = [
  ['anglesey', 'caernarfonshire'],
];

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

let cachedEdges: [string, string][] | null = null;

/** Every county pair whose tiles share a hex edge. */
export function landContact(map: TileMap): Set<string> {
  const byKey = new Map(map.tiles.map((t) => [`${t.col},${t.row}`, t]));
  const pairs = new Set<string>();
  for (const tile of map.tiles) {
    if (!tile.countyId) continue;
    for (const [nc, nr] of hexNeighbours(tile.col, tile.row)) {
      const other = byKey.get(`${nc},${nr}`)?.countyId;
      if (other && other !== tile.countyId) pairs.add(pairKey(tile.countyId, other));
    }
  }
  return pairs;
}

/**
 * The adjacency the game runs on: land contact plus the declared sea links.
 * Computed once from the static map and cached.
 */
export function britainAdjacency(): [string, string][] {
  if (cachedEdges) return cachedEdges;
  const pairs = landContact(buildBritainTileMap());
  for (const [a, b] of SEA_LINKS) pairs.add(pairKey(a, b));
  cachedEdges = [...pairs].sort().map((p) => p.split('|') as [string, string]);
  return cachedEdges;
}

/** Is this pair reachable only by sea? */
export function isSeaLink(a: string, b: string): boolean {
  return SEA_LINKS.some(([x, y]) => pairKey(x, y) === pairKey(a, b));
}

/**
 * Where the derived adjacency and the hand-declared lists disagree.
 *
 * Not an error — the declared lists were drawn against the old map, and the
 * ground has moved. It is reported so the divergence is visible and can be
 * judged, rather than discovered when an army cannot march somewhere obvious.
 */
export function adjacencyDrift(): { declaredOnly: string[]; derivedOnly: string[] } {
  const declared = new Set(mapEdges(BRITAIN).map(([a, b]) => pairKey(a, b)));
  const derived = new Set(britainAdjacency().map(([a, b]) => pairKey(a, b)));
  return {
    declaredOnly: [...declared].filter((p) => !derived.has(p)).sort(),
    derivedOnly: [...derived].filter((p) => !declared.has(p)).sort(),
  };
}
