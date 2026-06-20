/* Conscription & the weapons economy — raise troops, forge their arms. */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { createArmy } from '../state/army.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { runProduction } from '../systems/production.ts';
import { allocateLabour } from '../systems/labour.ts';
import { Season, UnitType } from '../types/enums.ts';
import type { Treasury } from '../types/realm.ts';

const ctx = { actorRealmId: 'p1' };
const treasury = (): Treasury => ({ gold: 0, wood: 0, stone: 0, iron: 0, weapons: {} });

test('blacksmith: forges the chosen weapon from the realm iron + wood', () => {
  const c = createCounty({ id: 'a', name: 'A', population: 200 });
  c.blacksmithProduct = UnitType.Swordsman; // costs iron 2, wood 1
  c.labour.industryShare = 1; // all hands to industry → the blacksmith crew
  const t = treasury();
  t.iron = 100;
  t.wood = 100;

  const s = runProduction(c, allocateLabour(c), t, Season.Spring);
  assertEqual(s.weapons, 50, 'crew of 200 ÷ 2, iron-limited to 50 swords');
  assertEqual(t.weapons.Swordsman, 50, 'banked to the armory');
  assertEqual(t.iron, 0, '50 × 2 iron consumed');
  assertEqual(t.wood, 50, '50 × 1 wood consumed');
});

test('SetBlacksmith: chooses a weapon, refuses peasant arms, accepts idle', () => {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true });
  const county = createCounty({ id: 'home', name: 'Home', ownerId: 'p1' });
  const w = createWorld({ realms: [realm], counties: [county] });

  assert(dispatch(w, { type: 'SetBlacksmith', countyId: 'home', product: UnitType.Archer }, ctx).ok, 'set archer');
  assertEqual(w.counties.home.blacksmithProduct, UnitType.Archer, 'product set');
  assert(!dispatch(w, { type: 'SetBlacksmith', countyId: 'home', product: UnitType.Peasant }, ctx).ok, 'peasants need no weapons');
  assert(dispatch(w, { type: 'SetBlacksmith', countyId: 'home', product: null }, ctx).ok, 'idle is allowed');
  assertEqual(w.counties.home.blacksmithProduct, null, 'smith idled');
});

test('Conscript: musters a new army from a county town', () => {
  const w = createBritainWorld();
  const before = w.counties.hampshire.population;
  const res = dispatch(w, { type: 'Conscript', countyId: 'hampshire', unit: UnitType.Peasant, count: 60 }, ctx);
  assert(res.ok, 'conscription accepted');

  const armyId = (res.data as { armyId: string }).armyId;
  assert(!!w.armies[armyId] && armyId !== 'p1-army', 'a new army was mustered');
  assertEqual(w.armies[armyId].units.Peasant, 60, '60 peasants under arms');
  assertEqual(w.armies[armyId].soldiers, 60, 'soldier total matches composition');
  assertEqual(w.counties.hampshire.population, before - 60, 'they left the population');
  assertGreater(w.counties.hampshire.recentConscription, 0, 'conscription stirs unrest');
});

function homeWorld(opts: { population?: number; happiness?: number; swords?: number } = {}) {
  const realm = createRealm({ id: 'p1', name: 'P', isHuman: true });
  if (opts.swords) realm.treasury.weapons.Swordsman = opts.swords;
  const county = createCounty({
    id: 'home', name: 'Home', ownerId: 'p1',
    population: opts.population ?? 300, happiness: opts.happiness ?? 80,
  });
  const army = createArmy({ id: 'p1-army', ownerId: 'p1', col: 0, row: 0, countyId: 'home', soldiers: 50 });
  return { realm, world: createWorld({ realms: [realm], counties: [county], armies: [army] }) };
}

test('Conscript: arms swordsmen from the armory and reinforces an army in place', () => {
  const { realm, world } = homeWorld({ swords: 30 });
  const res = dispatch(world, { type: 'Conscript', countyId: 'home', unit: UnitType.Swordsman, count: 20, armyId: 'p1-army' }, ctx);
  assert(res.ok, 'accepted');
  assertEqual(world.armies['p1-army'].units.Swordsman, 20, '20 swordsmen joined');
  assertEqual(world.armies['p1-army'].soldiers, 70, 'army grew to 70');
  assertEqual(realm.treasury.weapons.Swordsman, 10, '20 swords drawn from the armory');
});

test('Conscript: refuses without weapons, past the morale floor, or below 50 for a new army', () => {
  const { world } = homeWorld({ population: 300, happiness: 80 }); // no swords in armory
  assert(!dispatch(world, { type: 'Conscript', countyId: 'home', unit: UnitType.Swordsman, count: 5, armyId: 'p1-army' }, ctx).ok,
    'cannot arm unarmed swordsmen');
  assert(!dispatch(world, { type: 'Conscript', countyId: 'home', unit: UnitType.Peasant, count: 250, armyId: 'p1-army' }, ctx).ok,
    'a mass draft would break morale');
  assert(!dispatch(world, { type: 'Conscript', countyId: 'home', unit: UnitType.Peasant, count: 10 }, ctx).ok,
    'a brand-new army needs at least 50');
  // The failed commands left the army and population untouched.
  assertEqual(world.armies['p1-army'].soldiers, 50, 'army unchanged');
  assertEqual(world.counties.home.population, 300, 'population unchanged');
});
