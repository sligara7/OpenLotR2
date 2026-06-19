/* Hex coordinate math + generic A* pathfinding (maps/hex.ts). */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { offsetToCube, cubeToOffset, hexDistance, hexLine, findPath, type Offset } from '../maps/hex.ts';
import { hexNeighbours } from '../maps/tiles.ts';

test('hex: offset↔cube round-trips', () => {
  for (const o of [{ col: 0, row: 0 }, { col: 3, row: 5 }, { col: 7, row: 2 }, { col: 4, row: 9 }]) {
    const back = cubeToOffset(offsetToCube(o));
    assertEqual(`${back.col},${back.row}`, `${o.col},${o.row}`, `round-trip ${o.col},${o.row}`);
  }
});

test('hex: a tile is distance 0 from itself and 1 from every neighbour', () => {
  const o = { col: 5, row: 4 };
  assertEqual(hexDistance(o, o), 0, 'self distance');
  for (const [c, r] of hexNeighbours(o.col, o.row)) {
    assertEqual(hexDistance(o, { col: c, row: r }), 1, `neighbour ${c},${r} is distance 1`);
  }
});

test('hex: a line has length distance+1 with adjacent steps', () => {
  const a = { col: 1, row: 1 };
  const b = { col: 6, row: 4 };
  const line = hexLine(a, b);
  assertEqual(line.length, hexDistance(a, b) + 1, 'line length');
  assertEqual(`${line[0].col},${line[0].row}`, '1,1', 'starts at a');
  assertEqual(`${line[line.length - 1].col},${line[line.length - 1].row}`, '6,4', 'ends at b');
  for (let i = 1; i < line.length; i++) {
    assertEqual(hexDistance(line[i - 1], line[i]), 1, 'consecutive line tiles are adjacent');
  }
});

test('hex: A* finds the shortest path and routes around a wall', () => {
  // 8x8 offset grid; one impassable column with a gap.
  const inBounds = (o: Offset) => o.col >= 0 && o.col < 8 && o.row >= 0 && o.row < 8;
  const blocked = (o: Offset) => o.col === 3 && o.row !== 5; // wall at col 3 except a gap at row 5
  const key = (o: Offset) => `${o.col},${o.row}`;
  const neighbours = (o: Offset) =>
    hexNeighbours(o.col, o.row).map(([c, r]) => ({ col: c, row: r })).filter(inBounds);
  const cost = (_: Offset, b: Offset) => (blocked(b) ? Infinity : 1);

  const start = { col: 0, row: 5 };
  const goal = { col: 6, row: 5 };
  const result = findPath(start, goal, neighbours, cost, key, (n, g) => hexDistance(n, g));
  assert(!!result, 'path found');
  assertEqual(key(result!.path[0]), key(start), 'starts at start');
  assertEqual(key(result!.path[result!.path.length - 1]), key(goal), 'ends at goal');
  for (const node of result!.path) assert(!blocked(node), 'path avoids the wall');
  assertGreater(result!.cost, hexDistance(start, goal) - 1, 'cost is at least the straight-line distance');

  // Fully wall off the goal → no path.
  const sealed = (_: Offset, b: Offset) => (b.col === 3 ? Infinity : 1);
  assertEqual(findPath(start, goal, neighbours, sealed, key), null, 'unreachable → null');
});
