/*
 * Tile movement / pathfinding over the hex map.
 *
 * Wraps the generic A* (hex.ts) with the map's actual rules: mountains and
 * water are impassable, and crossing a river edge costs extra. This is the
 * backbone for marching armies (and for AI movement) once units exist.
 */

import { findPath, hexDistance, type Offset } from './hex.ts';
import { edgeKey, hexNeighbours, isPassable, type HexTile, type TileMap } from './tiles.ts';

/** Extra movement cost to cross a river edge (Unciv-style river penalty). */
export const RIVER_CROSS_COST = 2;

export interface TilePath {
  tiles: HexTile[];
  cost: number;
}

/** Shortest passable path between two tiles, or null if unreachable. */
export function findTilePath(map: TileMap, from: Offset, to: Offset): TilePath | null {
  const byKey = new Map(map.tiles.map((t) => [`${t.col},${t.row}`, t]));
  const rivers = new Set(map.rivers);
  const key = (t: HexTile) => `${t.col},${t.row}`;

  const start = byKey.get(`${from.col},${from.row}`);
  const goal = byKey.get(`${to.col},${to.row}`);
  if (!start || !goal || !isPassable(goal.terrain) || !isPassable(start.terrain)) return null;

  const neighbours = (t: HexTile): HexTile[] =>
    hexNeighbours(t.col, t.row)
      .map(([c, r]) => byKey.get(`${c},${r}`))
      .filter((n): n is HexTile => !!n);

  const cost = (a: HexTile, b: HexTile): number => {
    if (!isPassable(b.terrain)) return Infinity;
    return 1 + (rivers.has(edgeKey(a.col, a.row, b.col, b.row)) ? RIVER_CROSS_COST : 0);
  };

  const result = findPath<HexTile>(start, goal, neighbours, cost, key, (n, g) => hexDistance(n, g));
  return result ? { tiles: result.path, cost: result.cost } : null;
}
