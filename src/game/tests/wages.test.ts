/* Army upkeep — wages drawn each turn, desertion when the purse falls short. */

import { test, assert, assertEqual, assertGreater, assertLess } from '../testing/harness.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { createArmy } from '../state/army.ts';
import { payWages } from '../systems/wages.ts';
import { WAGE_PER_SOLDIER } from '../constants.ts';

test('wages: a solvent realm pays upkeep with no desertion', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true, gold: 100 });
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: null, soldiers: 100 });
  const world = createWorld({ realms: [realm], counties: [], armies: [army] });

  const ledger = payWages(world);
  assertEqual(world.realms.p1.treasury.gold, 100 - 100 * WAGE_PER_SOLDIER, 'wages deducted');
  assertEqual(ledger.realms[0].deserted, 0, 'no desertion while solvent');
  assertEqual(world.armies['a'].soldiers, 100, 'army intact');
});

test('wages: a broke realm bleeds deserters and empties its purse', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true, gold: 1 });
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: null, soldiers: 200 });
  const world = createWorld({ realms: [realm], counties: [], armies: [army] });

  const ledger = payWages(world);
  assertEqual(world.realms.p1.treasury.gold, 0, 'purse emptied');
  assertGreater(ledger.realms[0].deserted, 0, 'soldiers deserted');
  assertLess(world.armies['a'].soldiers, 200, 'the army shrank');
});

test('wages: an unpaid army eventually deserts to nothing and is disbanded', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true, gold: 0 });
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: null, soldiers: 6 });
  const world = createWorld({ realms: [realm], counties: [], armies: [army] });

  for (let i = 0; i < 30 && world.armies['a']; i++) { world.realms.p1.treasury.gold = 0; payWages(world); }
  assert(!world.armies['a'], 'the army withered away');
});
