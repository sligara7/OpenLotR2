/* Army lifecycle commands — disband, split, combine. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createRealm } from '../state/realm.ts';
import { createCounty } from '../state/county.ts';
import { createWorld } from '../state/world.ts';
import { createArmy } from '../state/army.ts';
import { dispatch } from '../commands/dispatch.ts';
import type { GameState } from '../types/realm.ts';

const ctx = { actorRealmId: 'p1' };

test('disband: soldiers rejoin the county and weapons return to the armory', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true });
  const county = createCounty({ id: 'home', name: 'Home', ownerId: 'p1', population: 200 });
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: 'home', units: { Peasant: 30, Swordsman: 20 } });
  const world = createWorld({ realms: [realm], counties: [county], armies: [army] });

  assert(dispatch(world, { type: 'DisbandArmy', armyId: 'a' }, ctx).ok, 'disband accepted');
  assert(!world.armies['a'], 'army is gone');
  assertEqual(world.counties.home.population, 250, '50 soldiers rejoined the population');
  assertEqual(world.realms.p1.treasury.weapons.Swordsman, 20, '20 swords returned to the armory');
});

test('disband: refused unless the army stands in your own county', () => {
  const world = createWorld({
    realms: [createRealm({ id: 'p1', name: 'P', isHuman: true }), createRealm({ id: 'p2', name: 'B' })],
    counties: [createCounty({ id: 'x', name: 'X', ownerId: 'p2' })],
    armies: [createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: 'x', soldiers: 50 })],
  });
  assert(!dispatch(world, { type: 'DisbandArmy', armyId: 'a' }, ctx).ok, 'cannot disband on foreign soil');
});

function splitWorld(): GameState {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true });
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 2, row: 3, countyId: 'home', units: { Peasant: 80, Knight: 40 } });
  return createWorld({ realms: [realm], counties: [createCounty({ id: 'home', name: 'H', ownerId: 'p1' })], armies: [army] });
}

test('split: carves a new army off on the same tile', () => {
  const world = splitWorld();
  const res = dispatch(world, { type: 'SplitArmy', armyId: 'a', units: { Knight: 40, Peasant: 20 } }, ctx);
  assert(res.ok, 'split accepted');
  const newId = (res.data as { armyId: string }).armyId;
  assertEqual(world.armies['a'].soldiers, 60, 'parent keeps 60');
  assertEqual(world.armies[newId].soldiers, 60, 'the new army has 60');
  assertEqual(world.armies[newId].units.Knight, 40, 'knights moved across');
  assertEqual(`${world.armies[newId].col},${world.armies[newId].row}`, '2,3', 'on the parent\'s tile');
});

test('split: refused if either part would fall below the 50-soldier minimum', () => {
  const world = createWorld({
    realms: [createRealm({ id: 'p1', name: 'P', isHuman: true })],
    counties: [createCounty({ id: 'home', name: 'H', ownerId: 'p1' })],
    armies: [createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: 'home', units: { Peasant: 60 } })],
  });
  assert(!dispatch(world, { type: 'SplitArmy', armyId: 'a', units: { Peasant: 40 } }, ctx).ok, 'remainder too small');
  assert(!dispatch(world, { type: 'SplitArmy', armyId: 'a', units: { Peasant: 10 } }, ctx).ok, 'split too small');
  assert(!dispatch(world, { type: 'SplitArmy', armyId: 'a', units: { Peasant: 99 } }, ctx).ok, 'more than it has');
});

test('combine: merges two co-located armies of yours, refuses different tiles', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true });
  const a = createArmy({ id: 'a', ownerId: 'p1', col: 1, row: 1, countyId: null, units: { Peasant: 50 } });
  const b = createArmy({ id: 'b', ownerId: 'p1', col: 1, row: 1, countyId: null, units: { Swordsman: 50 } });
  const world = createWorld({ realms: [realm], counties: [], armies: [a, b] });

  assert(dispatch(world, { type: 'CombineArmy', armyId: 'b', intoArmyId: 'a' }, ctx).ok, 'combine accepted');
  assert(!world.armies['b'], 'the merged army is removed');
  assertEqual(world.armies['a'].soldiers, 100, 'combined strength');
  assertEqual(world.armies['a'].units.Swordsman, 50, 'swordsmen merged in');

  // A second army elsewhere cannot be combined.
  const c = createArmy({ id: 'c', ownerId: 'p1', col: 9, row: 9, countyId: null, units: { Archer: 50 } });
  world.armies['c'] = c;
  assert(!dispatch(world, { type: 'CombineArmy', armyId: 'c', intoArmyId: 'a' }, ctx).ok, 'must share a tile');
});
