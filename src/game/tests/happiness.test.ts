/* Happiness factors (systems/happiness.ts). */

import { test, assertClose } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { updateHappiness } from '../systems/happiness.ts';
import { RationLevel } from '../types/enums.ts';

test('happiness: taxes above tolerance reduce happiness', () => {
  const c = createCounty({ id: 'a', name: 'A', happiness: 50, taxRate: 80 });
  c.health = 50; // neutral health contribution
  updateHappiness(c); // tax: -(80-30)*0.6 = -30
  assertClose(c.happiness, 20, 0.001, 'high tax bites');
});

test('happiness: low taxes, good health and double rations all lift it', () => {
  const c = createCounty({ id: 'b', name: 'B', happiness: 50, taxRate: 10 });
  c.health = 100;
  c.achievedRation = RationLevel.Double;
  updateHappiness(c); // +3 tax +6 health +4 rations = +13
  assertClose(c.happiness, 63, 0.001, 'good governance cheers people');
});

test('happiness: heavy conscription angers the populace', () => {
  const c = createCounty({ id: 'c', name: 'C', happiness: 50, taxRate: 30 });
  c.health = 50;
  c.population = 1000;
  c.recentConscription = 100; // 10% drafted => -12
  updateHappiness(c);
  assertClose(c.happiness, 38, 0.001, 'the draft hurts');
});
