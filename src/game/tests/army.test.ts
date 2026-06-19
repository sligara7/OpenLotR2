/* Armies on the map + the MoveArmy command. */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { buildBritainTileMap } from '../maps/britain-tiles.ts';
import { hexNeighbours, isPassable } from '../maps/tiles.ts';

const ctx = { actorRealmId: 'p1' };

test('army: each realm starts with an army at its capital town', () => {
  const world = createBritainWorld();
  const armies = Object.values(world.armies);
  assertEqual(armies.length, 3, 'three armies (one per realm)');
  assert(!!world.armies['p1-army'], 'player has an army');
  assertGreater(world.armies['p1-army'].soldiers, 0, 'army has soldiers');
});

test('army: starting counties hold a castle', () => {
  const world = createBritainWorld();
  assert(world.counties.hampshire.castle.type !== 'None', 'Hampshire has a castle');
  assertEqual(world.counties.yorkshire.castle.type, 'None', 'neutral Yorkshire has none');
});

test('army: MoveArmy walks to a reachable tile, refuses sea + others armies', () => {
  const world = createBritainWorld();
  const map = buildBritainTileMap();
  const byKey = new Map(map.tiles.map((t) => [`${t.col},${t.row}`, t]));
  const army = world.armies['p1-army'];

  // A passable neighbour of the army's tile.
  const dest = hexNeighbours(army.col, army.row)
    .map(([c, r]) => byKey.get(`${c},${r}`))
    .find((t) => t && isPassable(t.terrain) && t.countyId !== null)!;

  const ok = dispatch(world, { type: 'MoveArmy', armyId: 'p1-army', col: dest.col, row: dest.row }, ctx);
  assert(ok.ok, 'march accepted');
  assertEqual(`${army.col},${army.row}`, `${dest.col},${dest.row}`, 'army moved');

  // Cannot march into the sea.
  const sea = map.tiles.find((t) => t.countyId === null)!;
  assert(!dispatch(world, { type: 'MoveArmy', armyId: 'p1-army', col: sea.col, row: sea.row }, ctx).ok, 'sea refused');

  // Cannot move someone else's army.
  assert(!dispatch(world, { type: 'MoveArmy', armyId: 'p2-army', col: dest.col, row: dest.row }, ctx).ok, 'not your army');
});
