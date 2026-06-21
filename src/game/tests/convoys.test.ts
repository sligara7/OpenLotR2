/* Supply convoys — dispatch, travel, delivery, interception, and feeding. */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { createRealm } from '../state/realm.ts';
import { createCounty } from '../state/county.ts';
import { createWorld } from '../state/world.ts';
import { createArmy } from '../state/army.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { advanceConvoys } from '../systems/convoys.ts';
import { forageArmies } from '../systems/foraging.ts';
import { buildBritainTileMap, countyTowns } from '../maps/index.ts';

const ctx = { actorRealmId: 'p1' };

test('SendConvoy: draws grain from the county and refuses bad requests', () => {
  const world = createBritainWorld();
  const before = world.counties.hampshire.food.grainSacks;
  const res = dispatch(world, { type: 'SendConvoy', fromCountyId: 'hampshire', toArmyId: 'p1-army', grainSacks: 100 }, ctx);
  assert(res.ok, 'convoy dispatched');
  assertEqual(world.counties.hampshire.food.grainSacks, before - 100, 'grain left the store');
  assertEqual(Object.keys(world.convoys).length, 1, 'a convoy is in transit');

  assert(!dispatch(world, { type: 'SendConvoy', fromCountyId: 'hampshire', toArmyId: 'p1-army', grainSacks: 9e9 }, ctx).ok, 'not enough grain');
  assert(!dispatch(world, { type: 'SendConvoy', fromCountyId: 'hampshire', toArmyId: 'p2-army', grainSacks: 10 }, ctx).ok, 'not your army');
});

test('convoy: delivers its food into the target army on arrival', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army']; // sits on the hampshire town tile
  dispatch(world, { type: 'SendConvoy', fromCountyId: 'hampshire', toArmyId: 'p1-army', grainSacks: 80 }, ctx);

  const ledger = advanceConvoys(world); // starts on the army's tile → delivers at once
  assertEqual(ledger.convoys[0].status, 'delivered', 'reached the army');
  assertEqual(army.supply, 80, 'army supply topped up');
  assertEqual(Object.keys(world.convoys).length, 0, 'convoy consumed');
});

test('convoy: rolls toward a distant army over turns, then delivers', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army'];
  const berkshire = countyTowns(buildBritainTileMap()).get('berkshire')!;
  army.col = berkshire.col; army.row = berkshire.row; army.countyId = 'berkshire';

  dispatch(world, { type: 'SendConvoy', fromCountyId: 'hampshire', toArmyId: 'p1-army', grainSacks: 60 }, ctx);
  const convoyId = Object.keys(world.convoys)[0];
  const start = `${world.convoys[convoyId].col},${world.convoys[convoyId].row}`;

  let delivered = false;
  for (let i = 0; i < 12 && !delivered; i++) delivered = advanceConvoys(world).convoys.some((c) => c.status === 'delivered');
  assert(delivered, 'the convoy eventually reaches the army');
  assertEqual(army.supply, 60, 'army resupplied');
  assert(start !== `${army.col},${army.row}`, 'it really travelled');
});

test('convoy: an enemy army on its tile destroys it (raided supply line)', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army'];
  world.armies['raider'] = createArmy({ id: 'raider', ownerId: 'p2', col: army.col, row: army.row, countyId: army.countyId, soldiers: 50 });
  dispatch(world, { type: 'SendConvoy', fromCountyId: 'hampshire', toArmyId: 'p1-army', grainSacks: 50 }, ctx);

  const ledger = advanceConvoys(world);
  assertEqual(ledger.convoys[0].status, 'intercepted', 'the enemy seizes it');
  assertEqual(Object.keys(world.convoys).length, 0, 'convoy destroyed');
  assertEqual(army.supply, 0, 'nothing delivered');
});

test('foraging: an army eats its carried supply first and survives barren land', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true });
  const barren = createCounty({ id: 'b', name: 'B', ownerId: 'p1', population: 0, grainSacks: 0, cows: 0 });
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: 'b', soldiers: 50, supply: 100 });
  const world = createWorld({ realms: [realm], counties: [barren], armies: [army] });

  const ledger = forageArmies(world);
  assertEqual(ledger.armies[0].fromSupply, 50, 'ate 50 from its own baggage');
  assertEqual(ledger.armies[0].starved, 0, 'no starvation while supplied');
  assertEqual(world.armies['a'].supply, 50, 'supply drawn down');
  assertGreater(world.armies['a'].soldiers, 0, 'army intact');
});
