/* Revolts (systems/revolt.ts). */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { updateRevolt } from '../systems/revolt.ts';
import { CONQUEST, REVOLT_PATIENCE } from '../constants.ts';

test('revolt: a content county never revolts', () => {
  const c = createCounty({ id: 'a', name: 'A', happiness: 50, ownerId: 'p1' });
  const r = updateRevolt(c);
  assertEqual(r.revoltTriggered, false, 'no revolt');
  assertEqual(c.unrestSeasons, 0, 'unrest stays at zero');
});

test('revolt: sustained misery triggers a revolt and loses the county', () => {
  const c = createCounty({ id: 'b', name: 'B', happiness: 5, ownerId: 'p1' });
  updateRevolt(c); // 1
  updateRevolt(c); // 2
  assertEqual(c.revolting, false, 'patience not yet exhausted');
  const r = updateRevolt(c); // 3 => triggers
  assertEqual(r.revoltTriggered, true, 'revolt fires after patience runs out');
  assertEqual(c.ownerId, null, 'county leaves the realm');
});

test('revolt: a freshly conquered county is pacified and cannot revolt at first', () => {
  const c = createCounty({ id: 'c', name: 'C', happiness: 5, ownerId: 'p1' });
  c.pacifiedSeasons = CONQUEST.pacifySeasons; // as captureCounty sets it
  // Even miserable, it holds firm while occupied — well past the normal patience.
  for (let i = 0; i < CONQUEST.pacifySeasons; i += 1) {
    assertEqual(updateRevolt(c).revoltTriggered, false, 'occupation keeps order');
    assertEqual(c.unrestSeasons, 0, 'unrest does not accrue under occupation');
  }
  assertEqual(c.pacifiedSeasons, 0, 'occupation has worn off');
  // Now the normal countdown applies.
  for (let i = 0; i < REVOLT_PATIENCE - 1; i += 1) updateRevolt(c);
  assert(updateRevolt(c).revoltTriggered, 'once pacification lapses, misery finally tells');
});
