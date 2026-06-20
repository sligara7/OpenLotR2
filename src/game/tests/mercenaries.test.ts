/* Mercenaries — hired, self-armed bands: costly, can't double up, disperse. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createRealm } from '../state/realm.ts';
import { createCounty } from '../state/county.ts';
import { createWorld } from '../state/world.ts';
import { createArmy } from '../state/army.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { payWages } from '../systems/wages.ts';
import { UnitType } from '../types/enums.ts';

const ctx = { actorRealmId: 'p1' };

test('mercenaries: hiring raises a self-armed band for gold, no population or happiness cost', () => {
  const world = createBritainWorld();
  const pop = world.counties.hampshire.population;
  const happy = world.counties.hampshire.happiness;
  const gold = world.realms.p1.treasury.gold;

  const res = dispatch(world, { type: 'HireMercenaries', countyId: 'hampshire', unit: UnitType.Crossbowman, count: 50 }, ctx);
  assert(res.ok, 'hire accepted');
  const army = world.armies[(res.data as { armyId: string }).armyId];
  assert(army.mercenary, 'the band is mercenary');
  assertEqual(army.units.Crossbowman, 50, 'self-armed crossbowmen');
  assertEqual(world.counties.hampshire.population, pop, 'no one was conscripted');
  assertEqual(world.counties.hampshire.happiness, happy, 'no happiness hit');
  assertEqual(world.realms.p1.treasury.gold, gold - 100, 'paid the 2-per-soldier fee');
});

test('mercenaries: hiring is refused below the minimum band or without the gold', () => {
  const world = createBritainWorld();
  assert(!dispatch(world, { type: 'HireMercenaries', countyId: 'hampshire', unit: UnitType.Knight, count: 10 }, ctx).ok, 'too small');
  world.realms.p1.treasury.gold = 10;
  assert(!dispatch(world, { type: 'HireMercenaries', countyId: 'hampshire', unit: UnitType.Knight, count: 50 }, ctx).ok, 'too poor');
});

test('mercenaries: a mercenary army costs far more in wages', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true, gold: 1000 });
  const merc = createArmy({ id: 'm', ownerId: 'p1', col: 0, row: 0, countyId: null, units: { Knight: 100 }, mercenary: true });
  const citizen = createArmy({ id: 'c', ownerId: 'p1', col: 0, row: 0, countyId: null, units: { Knight: 100 } });
  const world = createWorld({ realms: [realm], counties: [], armies: [merc, citizen] });

  const before = realm.treasury.gold;
  payWages(world);
  // citizen 100*0.05 = 5, mercenary 100*0.05*3 = 15 → 20 total.
  assertEqual(before - realm.treasury.gold, 20, 'mercenaries draw triple wages');
});

test('mercenaries: two mercenary bands will not combine, but a band can join a citizen army', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true });
  const m1 = createArmy({ id: 'm1', ownerId: 'p1', col: 1, row: 1, countyId: null, units: { Swordsman: 50 }, mercenary: true });
  const m2 = createArmy({ id: 'm2', ownerId: 'p1', col: 1, row: 1, countyId: null, units: { Archer: 50 }, mercenary: true });
  const cit = createArmy({ id: 'c', ownerId: 'p1', col: 1, row: 1, countyId: null, units: { Peasant: 50 } });
  const world = createWorld({ realms: [realm], counties: [], armies: [m1, m2, cit] });

  assert(!dispatch(world, { type: 'CombineArmy', armyId: 'm2', intoArmyId: 'm1' }, ctx).ok, 'rival clans refuse to merge');
  assert(dispatch(world, { type: 'CombineArmy', armyId: 'm1', intoArmyId: 'c' }, ctx).ok, 'mercenaries can join a citizen army');
  assert(world.armies['c'].mercenary, 'the combined army now contains mercenaries');
});

test('mercenaries: disbanding a band disperses it — no troops or weapons returned', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true });
  const county = createCounty({ id: 'home', name: 'H', ownerId: 'p1', population: 200 });
  const merc = createArmy({ id: 'm', ownerId: 'p1', col: 0, row: 0, countyId: 'home', units: { Swordsman: 50 }, mercenary: true });
  const world = createWorld({ realms: [realm], counties: [county], armies: [merc] });

  assert(dispatch(world, { type: 'DisbandArmy', armyId: 'm' }, ctx).ok, 'disband accepted');
  assert(!world.armies['m'], 'the band is gone');
  assertEqual(world.counties.home.population, 200, 'hired hands do not swell the population');
  assertEqual(world.realms.p1.treasury.weapons.Swordsman ?? 0, 0, 'they keep their own arms');
});
