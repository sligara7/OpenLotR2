/*
 * Tile movement / pathfinding over the hex map.
 *
 * Wraps the generic A* (hex.ts) with the map's actual rules: mountains and
 * water are impassable, and crossing a river edge costs extra. This is the
 * backbone for marching armies (and for AI movement) once units exist.
 */

import { findPath, hexDistance, type Offset } from './hex.ts';
import { edgeKey, hexNeighbours, isPassable, type HexTile, type TileMap } from './tiles.ts';

/**
 * Extra movement cost to cross a river edge (Unciv-style river penalty).
 *
 * Scaled with the map: a fixed penalty gets weaker as tiles get finer, and a
 * journey now costs about 2.3x more points than it did, so the old +2 had
 * become proportionally a third of its former weight.
 *
 * ⚠️ CURRENTLY INERT, AND MEASURED SO — not a tuning problem. On 2026-08-26,
 * across all 182 adjacent-county journeys and four coast-to-coast marches
 * (including Hampshire to Caithness, 112 tiles), the number of river crossings
 * was ZERO. The cause is river GENERATION, not this constant: carveRivers
 * produces 61 disconnected systems over 2,752 land tiles, the longest 9 edges
 * and 28 of them single-edge stubs. Puddles, not barriers — so pathfinding
 * always steps around them and raising this number only widens the detour.
 *
 * Left at the correctly-scaled value so it behaves properly once rivers are
 * carved as continuous source-to-sea courses. Until then, rivers are scenery.
 */
export const RIVER_CROSS_COST = 5;

export interface TilePath {
  tiles: HexTile[];
  cost: number;
  /** Cost to ENTER each tile from the previous one (stepCosts[0] === 0). Lets a
   *  caller walk the route within a movement budget. */
  stepCosts: number[];
}

/** Cost to step from tile `a` onto adjacent tile `b` (∞ if impassable). */
function stepCost(a: HexTile, b: HexTile, rivers: ReadonlySet<string>): number {
  if (!isPassable(b.terrain)) return Infinity;
  return 1 + (rivers.has(edgeKey(a.col, a.row, b.col, b.row)) ? RIVER_CROSS_COST : 0);
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

  const cost = (a: HexTile, b: HexTile): number => stepCost(a, b, rivers);

  const result = findPath<HexTile>(start, goal, neighbours, cost, key, (n, g) => hexDistance(n, g));
  if (!result) return null;
  const stepCosts = result.path.map((t, i) => (i === 0 ? 0 : stepCost(result.path[i - 1], t, rivers)));
  return { tiles: result.path, cost: result.cost, stepCosts };
}

/** The furthest point along a path reachable within `budget` movement points:
 *  the path-index of the stop tile and the points it costs to get there. */
export function advanceWithinBudget(path: TilePath, budget: number): { index: number; spent: number } {
  let spent = 0;
  let index = 0;
  for (let i = 1; i < path.tiles.length; i++) {
    if (spent + path.stepCosts[i] > budget) break;
    spent += path.stepCosts[i];
    index = i;
  }
  return { index, spent };
}
