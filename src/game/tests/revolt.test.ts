/* Revolts (systems/revolt.ts). */

import { test, assertEqual } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { updateRevolt } from '../systems/revolt.ts';

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
