/* Exploration / fog of war (Manual Part-8): armies reveal the land they cross. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { createRng } from '../rng.ts';
import { isExplored, revealDisk, tileKey } from '../systems/exploration.ts';
import { buildBritainTileMap, countyTowns, findTilePath } from '../maps/index.ts';

test('option off: no exploration is recorded', () => {
  const w = createBritainWorld();
  assertEqual(w.options.exploration, false, 'fog of war is off by default');
  assertEqual(Object.keys(w.exploration).length, 0, 'nothing is tracked');
});

test('start: a realm sees the ground around its own armies', () => {
  const w = createBritainWorld({ exploration: true });
  const army = Object.values(w.armies).find((a) => a.ownerId === 'p1')!;
  assert(isExplored(w, 'p1', army.col, army.row), 'the tile under my army is explored');
  // A neighbouring tile within the vision radius is revealed too.
  assert(isExplored(w, 'p1', army.col + 1, army.row) || isExplored(w, 'p1', army.col, army.row + 1),
    'the immediate surroundings are revealed');
  // ...but the far side of the island is still dark.
  assert(!isExplored(w, 'p1', army.col, army.row + 20), 'distant land is unexplored');
});

test('marching reveals the route, and vision is per-realm', () => {
  const w = createBritainWorld({ exploration: true });
  const army = Object.values(w.armies).find((a) => a.ownerId === 'p1')!;
  // March toward a reachable destination a few tiles away.
  const map = buildBritainTileMap();
  const towns = countyTowns(map);
  let dest: { col: number; row: number } | null = null;
  for (const c of Object.values(w.counties)) {
    if (c.ownerId === 'p1') continue;
    const t = towns.get(c.id);
    if (t && findTilePath(map, { col: army.col, row: army.row }, t)) { dest = t; break; }
  }
  assert(!!dest, 'a reachable destination exists');

  const startKey = tileKey(army.col, army.row);
  dispatch(w, { type: 'MoveArmy', armyId: army.id, col: dest!.col, row: dest!.row },
    { actorRealmId: 'p1', rng: createRng(1) });
  // The army advanced and revealed new ground beyond where it began.
  assert(isExplored(w, 'p1', army.col, army.row), 'the new position is explored');
  assert(tileKey(army.col, army.row) !== startKey, 'the army actually moved');
  // p2 has not seen p1's scouting.
  assert(!isExplored(w, 'p2', army.col, army.row), 'exploration is private to each realm');
});

test('revealDisk marks every tile within the radius', () => {
  const w = createBritainWorld({ exploration: true });
  revealDisk(w, 'p3', 10, 10, 1);
  // Centre + its six neighbours (odd-r) are all explored.
  assert(isExplored(w, 'p3', 10, 10), 'centre revealed');
  let neighbours = 0;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (isExplored(w, 'p3', 10 + dc, 10 + dr)) neighbours += 1;
  }
  assert(neighbours >= 6, 'the surrounding ring is revealed');
});
