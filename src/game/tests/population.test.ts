/* Population dynamics (systems/population.ts). */

import { test, assertEqual } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { updatePopulation } from '../systems/population.ts';
import type { Rng } from '../rng.ts';

// No baby boom, deterministic.
const STEADY: Rng = { next: () => 0.9, range: () => 0, int: () => 0, chance: () => false, state: () => 0 };

test('population: a happy, healthy county grows', () => {
  const c = createCounty({ id: 'a', name: 'A', population: 1000, happiness: 100, health: 100 });
  const r = updatePopulation(c, STEADY); // births 60, deaths 15, no emigration
  assertEqual(r.births, 60, 'birth count');
  assertEqual(r.deaths, 15, 'death count');
  assertEqual(c.population, 1045, 'net growth');
});

test('population: a miserable county shrinks via deaths and emigration', () => {
  const c = createCounty({ id: 'b', name: 'B', population: 1000, happiness: 0, health: 50 });
  const r = updatePopulation(c, STEADY); // births 20, deaths 45, emigrants 40
  assertEqual(r.emigrants, 40, 'emigration kicks in below the pivot');
  assertEqual(c.population, 935, 'net decline');
});
