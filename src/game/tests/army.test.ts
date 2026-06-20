/* Armies on the map + the MoveArmy command. */

import { test, assert, assertEqual, assertGreater, assertLess } from '../testing/harness.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { advanceSeason } from '../engine.ts';
import { createRng } from '../rng.ts';
import { armyMovementAllowance, createArmy, setUnits, unitsOf } from '../state/army.ts';
import { buildBritainTileMap } from '../maps/britain-tiles.ts';
import { hexNeighbours, isPassable, countyTowns } from '../maps/tiles.ts';

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

test('army: a short march reaches the tile and spends the step cost', () => {
  const world = createBritainWorld();
  const map = buildBritainTileMap();
  const byKey = new Map(map.tiles.map((t) => [`${t.col},${t.row}`, t]));
  const army = world.armies['p1-army'];
  const budget = armyMovementAllowance(army);
  assertEqual(army.movement, budget, 'starts with a full budget (its slowest unit\'s speed)');

  const dest = hexNeighbours(army.col, army.row)
    .map(([c, r]) => byKey.get(`${c},${r}`))
    .find((t) => t && isPassable(t.terrain) && t.countyId !== null)!;
  const res = dispatch(world, { type: 'MoveArmy', armyId: 'p1-army', col: dest.col, row: dest.row }, ctx);
  assert(res.ok && (res.data as { reached: boolean }).reached, 'arrived at the adjacent tile');
  assertLess(army.movement, budget, 'a step was paid for');
  assertGreater(army.movement, budget - 4, 'one step is cheap (≤3 with a river)');
});

test('army: movement points cap a long march; it halts partway', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army'];
  const startKey = `${army.col},${army.row}`;

  // Aim at a far Scottish county — too far to reach in one turn.
  const budget = armyMovementAllowance(army);
  const far = countyTowns(buildBritainTileMap()).get('midlothian')!;
  const res = dispatch(world, { type: 'MoveArmy', armyId: 'p1-army', col: far.col, row: far.row }, ctx);
  assert(res.ok, 'march accepted');
  assertEqual((res.data as { reached: boolean }).reached, false, 'did not arrive (out of range)');
  assert(`${army.col},${army.row}` !== startKey, 'but the army advanced');
  assert(army.movement >= 0 && army.movement < budget, 'movement was spent, never negative');
});

test('army: an exhausted army cannot march; the turn refreshes its movement', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army'];
  const far = countyTowns(buildBritainTileMap()).get('midlothian')!;

  army.movement = 0;
  assert(!dispatch(world, { type: 'MoveArmy', armyId: 'p1-army', col: far.col, row: far.row }, ctx).ok,
    'no points → cannot advance');

  advanceSeason(world, createRng(1));
  const refreshed = world.armies['p1-army'];
  assertEqual(refreshed.movement, armyMovementAllowance(refreshed), 'movement refreshed for the new turn');
});

test('army: speed is set by the slowest unit (combined arms keep pace with pikes)', () => {
  const here = { ownerId: 'p1', col: 0, row: 0, countyId: null };
  const cavalry = createArmy({ id: 'c', ...here, units: { Knight: 50 } });
  const pikes = createArmy({ id: 'p', ...here, units: { Pikeman: 50 } });
  const mixed = createArmy({ id: 'm', ...here, units: { Knight: 49, Pikeman: 1 } });

  assertGreater(cavalry.movement, pikes.movement, 'pure cavalry outruns pure pikes');
  assertEqual(mixed.movement, pikes.movement, 'one pikeman drags the whole army to pike speed');
});

test('army: conscripting a slower unit immediately slows the army this turn', () => {
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: null, units: { Knight: 50 } });
  const fast = army.movement;
  setUnits(army, unitsOf({ Knight: 50, Pikeman: 10 }));
  assertLess(army.movement, fast, 'adding pikemen caps movement at pike speed');
});
