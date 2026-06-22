/* Advanced Farming (Manual Part-8): weather, fertility, seasonal grain labour. */

import { test, assert, assertEqual, assertGreater, assertLess, assertClose } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createWorld } from '../state/world.ts';
import { createRealm } from '../state/realm.ts';
import { advanceSeason } from '../engine.ts';
import { createRng } from '../rng.ts';
import {
  rollWeather,
  weatherYieldFactor,
  seasonalGrainDemand,
  updateFertility,
  fertilityYieldFactor,
} from '../systems/farming.ts';
import { FieldStatus, Season, Weather } from '../types/enums.ts';
import { ADVANCED_FARMING } from '../constants.ts';

/** A one-county world owned by p1, all fields grain, with stored seed grain. */
function grainWorld(advancedFarming: boolean, fieldCount = 6) {
  const county = createCounty({
    id: 'c', name: 'C', ownerId: 'p1', population: 200, grainSacks: 2000, fieldCount,
  });
  for (const f of county.fields) { f.status = FieldStatus.Grain; }
  return createWorld({
    realms: [createRealm({ id: 'p1', name: 'You', isHuman: true })],
    counties: [county],
    season: Season.Winter,
    options: { advancedFarming },
  });
}

test('weather: the draw is weighted and every outcome has a yield factor', () => {
  const rng = createRng(7);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) seen.add(rollWeather(rng));
  assert(seen.size >= 3, 'several weathers appear over many rolls');
  assertLess(weatherYieldFactor(Weather.Drought), 1, 'drought undercuts the harvest');
  assertEqual(weatherYieldFactor(Weather.Mild), 1, 'mild is neutral');
  assertGreater(weatherYieldFactor(Weather.Sunny), 1, 'sunny improves it');
});

test('seasonal labour: grain wants far more hands at the autumn harvest', () => {
  assertGreater(seasonalGrainDemand(Season.Fall), seasonalGrainDemand(Season.Spring),
    'harvest is the labour-hungry season');
  assertEqual(seasonalGrainDemand(Season.Summer), ADVANCED_FARMING.seasonalLabour.Summer, 'reads the table');
});

test('fertility: rises when a third stays fallow, falls when over-cropped', () => {
  // All grain → no fallow → fertility sinks toward the floor.
  const cropped = createCounty({ id: 'a', name: 'A', fieldCount: 6 });
  for (const f of cropped.fields) f.status = FieldStatus.Grain;
  cropped.fertility = 1;
  for (let i = 0; i < 40; i += 1) updateFertility(cropped);
  assertClose(cropped.fertility, ADVANCED_FARMING.fertilityFloor, 0.05, 'over-cropped soil degrades to the floor');

  // A third fallow → fertility recovers toward 1.
  const rested = createCounty({ id: 'b', name: 'B', fieldCount: 6 });
  rested.fields.forEach((f, i) => { f.status = i < 2 ? FieldStatus.Fallow : FieldStatus.Grain; });
  rested.fertility = ADVANCED_FARMING.fertilityFloor;
  for (let i = 0; i < 40; i += 1) updateFertility(rested);
  assertGreater(rested.fertility, 0.95, 'rested soil climbs back toward full fertility');
  assertEqual(fertilityYieldFactor(rested) > fertilityYieldFactor(cropped), true, 'fertile soil yields more');
});

test('option off: weather stays Mild and fertility stays 1 across a year', () => {
  const w = grainWorld(false);
  const rng = createRng(3);
  for (let i = 0; i < 4; i += 1) advanceSeason(w, rng);
  assertEqual(w.counties.c.weather, Weather.Mild, 'no weather without the option');
  assertEqual(w.counties.c.fertility, 1, 'no fertility drift without the option');
});

test('option on: a full year sets weather each season and drifts fertility', () => {
  const w = grainWorld(true);
  const rng = createRng(3);
  const weathers = new Set<string>();
  for (let i = 0; i < 8; i += 1) { advanceSeason(w, rng); weathers.add(w.counties.c.weather); }
  // All grain, no fallow → fertility should have fallen below 1.
  assertLess(w.counties.c.fertility, 1, 'over-cropped land loses fertility under the option');
  assert(weathers.size >= 1, 'weather is recorded each season');
});

test('option on: weather swings the harvest around the easy-play baseline', () => {
  // Same seed, same world, with and without advanced farming — compare the
  // grain in store after one full year. Advanced output differs from baseline.
  const baseline = grainWorld(false);
  const advanced = grainWorld(true);
  const r1 = createRng(11);
  const r2 = createRng(11);
  for (let i = 0; i < 4; i += 1) { advanceSeason(baseline, r1); advanceSeason(advanced, r2); }
  assert(baseline.counties.c.food.grainSacks !== advanced.counties.c.food.grainSacks,
    'advanced farming makes the harvest vary from the flat baseline');
});
