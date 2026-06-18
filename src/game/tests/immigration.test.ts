/* Inter-county immigration (systems/immigration.ts). */

import { test, assertEqual } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createWorld } from '../state/world.ts';
import { runImmigration } from '../systems/immigration.ts';

test('immigration: people move from the unhappier to the happier neighbour', () => {
  const a = createCounty({ id: 'A', name: 'A', population: 1000, happiness: 80 });
  const b = createCounty({ id: 'B', name: 'B', population: 1000, happiness: 20 });
  const world = createWorld({ realms: [], counties: [a, b], edges: [['A', 'B']] });
  runImmigration(world); // gap 60 => 1000*60*0.002 = 120 movers
  assertEqual(world.counties.A.population, 1120, 'happier county gains');
  assertEqual(world.counties.B.population, 880, 'unhappier county loses');
});

test('immigration: a small happiness gap produces no movement', () => {
  const a = createCounty({ id: 'A', name: 'A', population: 1000, happiness: 50 });
  const b = createCounty({ id: 'B', name: 'B', population: 1000, happiness: 48 });
  const world = createWorld({ realms: [], counties: [a, b], edges: [['A', 'B']] });
  runImmigration(world);
  assertEqual(world.counties.A.population, 1000, 'no flow below minGap');
  assertEqual(world.counties.B.population, 1000, 'no flow below minGap');
});
