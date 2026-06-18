/* Food & rations (systems/food.ts). */

import { test, assertEqual, assertClose } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { feedPopulation } from '../systems/food.ts';
import { RationLevel } from '../types/enums.ts';

test('food: ample grain serves the full Normal ration', () => {
  const c = createCounty({ id: 'a', name: 'A', population: 100, grainSacks: 200 });
  const r = feedPopulation(c, 0);
  assertEqual(r.achievedRation, RationLevel.Normal, 'achieved Normal');
  assertClose(c.food.grainSacks, 100, 0.001, '100 sacks eaten');
});

test('food: starvation drops the achieved ration below the wanted one', () => {
  const c = createCounty({ id: 'b', name: 'B', population: 100, grainSacks: 20 });
  const r = feedPopulation(c, 0);
  assertEqual(c.wantedRation, RationLevel.Normal, 'wanted Normal');
  assertEqual(r.achievedRation, RationLevel.None, 'achieved drops to None');
});

test('food: dairy is eaten first and never touches stored grain', () => {
  const c = createCounty({ id: 'c', name: 'C', population: 100, grainSacks: 50 });
  const r = feedPopulation(c, 150); // dairy can feed everyone
  assertClose(r.dairyServed, 100, 0.001, 'dairy feeds the whole pop');
  assertEqual(r.achievedRation, RationLevel.Normal, 'achieved Normal from dairy alone');
  assertClose(c.food.grainSacks, 50, 0.001, 'grain untouched');
});
