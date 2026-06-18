/* Health & plague (systems/health.ts). Uses injected deterministic RNGs. */

import { test, assertEqual, assertClose } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { updateHealth } from '../systems/health.ts';
import { RationLevel } from '../types/enums.ts';
import type { Rng } from '../rng.ts';

const NO_PLAGUE: Rng = { next: () => 0.9, range: () => 0, int: () => 0, chance: () => false };
const ALWAYS: Rng = { next: () => 0, range: () => 0, int: () => 0, chance: () => true };

test('health: poor rations drift health downward (capped per season)', () => {
  const c = createCounty({ id: 'a', name: 'A', health: 70 });
  updateHealth(c, RationLevel.Half, NO_PLAGUE); // target 45, drift cap 8
  assertClose(c.health, 62, 0.001, 'moved down by the drift cap');
});

test('health: Normal rations drift health upward', () => {
  const c = createCounty({ id: 'b', name: 'B', health: 50 });
  updateHealth(c, RationLevel.Normal, NO_PLAGUE); // target 70
  assertClose(c.health, 58, 0.001, 'moved up by the drift cap');
});

test('health: plague kills a fraction of the population', () => {
  const c = createCounty({ id: 'c', name: 'C', population: 1000, health: 80 });
  const r = updateHealth(c, RationLevel.Normal, ALWAYS);
  assertEqual(r.plague, true, 'plague struck');
  assertEqual(c.population, 880, '12% died');
  assertEqual(r.plagueDeaths, 120, 'deaths reported');
});
