/* Labour allocation (systems/labour.ts). */

import { test, assertClose } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { allocateLabour } from '../systems/labour.ts';

test('labour: industry workers split equally across operational tasks', () => {
  // Only the (universal) blacksmith is operational on the industry side.
  const c = createCounty({ id: 'a', name: 'A', population: 100, industries: { Lumber: true } });
  c.labour.industryShare = 1; // everyone to industry
  const alloc = allocateLabour(c);
  // Lumber + Blacksmith are operational => 50 each.
  assertClose(alloc.lumber, 50, 0.001, 'lumber crew');
  assertClose(alloc.blacksmith, 50, 0.001, 'blacksmith crew');
  assertClose(alloc.idle, 0, 0.001, 'no idle');
});

test('labour: agriculture workers go idle when no field needs them', () => {
  // All fields fallow, no cows => no agriculture task is operational.
  const c = createCounty({ id: 'b', name: 'B', population: 100, fieldCount: 4, cows: 0 });
  c.labour.industryShare = 0.5;
  const alloc = allocateLabour(c);
  assertClose(alloc.idle, 50, 0.001, 'half the workforce is idle');
  assertClose(alloc.blacksmith, 50, 0.001, 'industry half works the blacksmith');
});
