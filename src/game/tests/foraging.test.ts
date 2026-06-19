/* Foraging & starvation — armies eat the county they occupy. */

import { test, assert, assertEqual, assertGreater, assertLess } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { forageArmies } from '../systems/foraging.ts';
import { createBritainWorld } from '../scenarios.ts';
import { createRng } from '../rng.ts';
import { advanceSeason } from '../engine.ts';
import { ARMY_FORAGE_PORTIONS_PER_SOLDIER } from '../constants.ts';
import type { Army } from '../types/army.ts';

function worldWith(grainSacks: number, cows: number, soldiers: number) {
  const realm = createRealm({ id: 'p1', name: 'You', isHuman: true });
  const county = createCounty({ id: 'home', name: 'Home', ownerId: 'p1', grainSacks, cows });
  const army: Army = { id: 'p1-army', ownerId: 'p1', col: 0, row: 0, countyId: 'home', soldiers };
  return createWorld({ realms: [realm], counties: [county], armies: [army] });
}

test('foraging: a well-fed county loses food but the army does not starve', () => {
  const world = worldWith(500, 10, 40);
  const before = world.counties.home.food.grainSacks;

  const ledger = forageArmies(world);
  const result = ledger.armies[0];

  assertEqual(result.starved, 0, 'no starvation when supplied');
  assertEqual(world.armies['p1-army'].soldiers, 40, 'army intact');
  assertLess(world.counties.home.food.grainSacks, before, 'county grain drawn down');
  assertEqual(result.foraged, 40 * ARMY_FORAGE_PORTIONS_PER_SOLDIER, 'foraged its full appetite');
});

test('foraging: grain runs out, then beef covers the shortfall', () => {
  // 10 grain portions + (5 cows * 4) 20 beef portions = 30 < 40 needed.
  const world = worldWith(10, 5, 40);
  const ledger = forageArmies(world);

  assertEqual(world.counties.home.food.grainSacks, 0, 'grain emptied first');
  assertEqual(world.counties.home.food.cows, 0, 'then cattle eaten');
  assertEqual(ledger.armies[0].foraged, 30, 'foraged everything available');
  assertGreater(ledger.armies[0].starved, 0, 'still short of food → some starve');
});

test('foraging: a barren county starves the army each season', () => {
  const world = worldWith(0, 0, 40);
  const ledger = forageArmies(world);

  assertEqual(ledger.armies[0].foraged, 0, 'nothing to forage');
  assertGreater(ledger.armies[0].starved, 0, 'unsupplied army starves');
  assertLess(world.armies['p1-army'].soldiers, 40, 'army shrank');
});

test('foraging: a fully starved army is destroyed and removed', () => {
  const world = worldWith(0, 0, 3); // small force, no food anywhere
  let destroyed = false;
  for (let i = 0; i < 20 && !destroyed; i++) {
    destroyed = forageArmies(world).armies[0]?.destroyed ?? false;
  }
  assert(destroyed, 'an unsupplied army is eventually starved out');
  assert(!world.armies['p1-army'], 'destroyed army removed from the world');
});

test('foraging: advanceSeason reports a forage ledger for every army', () => {
  const world = createBritainWorld();
  const rng = createRng(7);
  const report = advanceSeason(world, rng);

  assert(Array.isArray(report.forage.armies), 'report carries a forage ledger');
  assertEqual(report.forage.armies.length, 3, 'one entry per army');
  for (const a of report.forage.armies) {
    assert(typeof a.foraged === 'number', 'each army recorded what it foraged');
  }
});
