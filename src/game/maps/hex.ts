/*
 * Hex-coordinate math + pathfinding.
 *
 * Our tiles use odd-r offset coordinates (col,row; odd rows shifted right). For
 * distance, lines and pathfinding it's cleanest to convert to cube coordinates
 * (the standard technique — Unciv reimplements the same canonical algorithms).
 * This module is pure (no tile/game dependency); the movement layer feeds it a
 * neighbour + cost function for the actual map.
 */

export interface Offset {
  col: number;
  row: number;
}

export interface Cube {
  x: number;
  y: number;
  z: number;
}

/** odd-r offset → cube. */
export function offsetToCube(o: Offset): Cube {
  const x = o.col - (o.row - (o.row & 1)) / 2;
  const z = o.row;
  return { x, y: -x - z, z };
}

/** cube → odd-r offset. */
export function cubeToOffset(c: Cube): Offset {
  return { col: c.x + (c.z - (c.z & 1)) / 2, row: c.z };
}

export function cubeDistance(a: Cube, b: Cube): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2;
}

/** Hex-grid distance (number of steps) between two offset tiles. */
export function hexDistance(a: Offset, b: Offset): number {
  return cubeDistance(offsetToCube(a), offsetToCube(b));
}

function cubeRound(c: Cube): Cube {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);
  const dx = Math.abs(rx - c.x);
  const dy = Math.abs(ry - c.y);
  const dz = Math.abs(rz - c.z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

/** The line of tiles from a to b (inclusive), via cube interpolation. */
export function hexLine(a: Offset, b: Offset): Offset[] {
  const ca = offsetToCube(a);
  const cb = offsetToCube(b);
  const n = cubeDistance(ca, cb);
  if (n === 0) return [a];
  const out: Offset[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(cubeToOffset(cubeRound({
      x: ca.x + (cb.x - ca.x) * t,
      y: ca.y + (cb.y - ca.y) * t,
      z: ca.z + (cb.z - ca.z) * t,
    })));
  }
  return out;
}

/**
 * Generic A* over arbitrary nodes.
 * @param neighbours adjacent nodes of n
 * @param cost step cost from→to; return Infinity for "impassable"
 * @param key stable string id for a node
 * @param heuristic admissible estimate to goal (default 0 = Dijkstra)
 * @returns the path (start..goal inclusive) and total cost, or null if unreachable
 */
export function findPath<N>(
  start: N,
  goal: N,
  neighbours: (n: N) => N[],
  cost: (from: N, to: N) => number,
  key: (n: N) => string,
  heuristic: (n: N, goal: N) => number = () => 0,
): { path: N[]; cost: number } | null {
  const goalKey = key(goal);
  const startKey = key(start);
  const open = new Map<string, N>([[startKey, start]]);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristic(start, goal)]]);
  const cameFrom = new Map<string, N>();

  while (open.size > 0) {
    // Lowest fScore in the open set (small maps → linear scan is fine).
    let currentKey = '';
    let best = Infinity;
    for (const k of open.keys()) {
      const f = fScore.get(k) ?? Infinity;
      if (f < best) { best = f; currentKey = k; }
    }
    const current = open.get(currentKey)!;
    if (currentKey === goalKey) {
      const path: N[] = [current];
      let ck = currentKey;
      while (cameFrom.has(ck)) {
        const prev = cameFrom.get(ck)!;
        path.unshift(prev);
        ck = key(prev);
      }
      return { path, cost: gScore.get(goalKey) ?? 0 };
    }
    open.delete(currentKey);

    for (const next of neighbours(current)) {
      const step = cost(current, next);
      if (!Number.isFinite(step)) continue;
      const tentative = (gScore.get(currentKey) ?? Infinity) + step;
      const nextKey = key(next);
      if (tentative < (gScore.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, current);
        gScore.set(nextKey, tentative);
        fScore.set(nextKey, tentative + heuristic(next, goal));
        open.set(nextKey, next);
      }
    }
  }
  return null;
}
