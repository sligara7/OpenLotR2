/* Production: agriculture cycle + industry (systems/production.ts). */

import { test, assertClose } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { allocateLabour } from '../systems/labour.ts';
import { runProduction } from '../systems/production.ts';
import { FieldStatus, Season } from '../types/enums.ts';
import { GRAIN_YIELD_MULTIPLIER } from '../constants.ts';
import type { Treasury } from '../types/realm.ts';

const treasury = (): Treasury => ({ gold: 0, wood: 0, stone: 0, iron: 0, weapons: {} });

test('production: an operational lumber mill yields wood to the treasury', () => {
  const c = createCounty({ id: 'a', name: 'A', population: 100, industries: { Lumber: true } });
  c.labour.industryShare = 1;
  const t = treasury();
  const s = runProduction(c, allocateLabour(c), t, Season.Spring);
  assertClose(s.wood, 75, 0.001, 'lumber crew of 50 * 1.5'); // 50 workers
  assertClose(t.wood, 75, 0.001, 'wood banked in treasury');
});

test('production: grain is sown in Winter, consuming stored sacks', () => {
  const c = createCounty({ id: 'b', name: 'B', population: 100, fieldCount: 1, grainSacks: 5 });
  c.fields[0].status = FieldStatus.Grain;
  c.labour.industryShare = 0; // all labour to farming
  runProduction(c, allocateLabour(c), treasury(), Season.Winter);
  assertClose(c.food.grainSacks, 0, 0.001, '5 sacks sown');
  assertClose(c.fields[0].sacksPlanted, 5, 0.001, 'field planted with 5 sacks');
});

test('production: industry output is capped by tile-derived capacity', () => {
  const c = createCounty({ id: 'cap', name: 'Cap', population: 1000, industries: { Lumber: true } });
  c.industries.Lumber.capacity = 10; // land sustains only 10 wood/season
  c.labour.industryShare = 1; // pile on workers anyway
  const s = runProduction(c, allocateLabour(c), treasury(), Season.Spring);
  assertClose(s.wood, 10, 0.001, 'capped by the land, not the labour');
});

test('production: grain is harvested in Fall at the yield multiplier', () => {
  const c = createCounty({ id: 'c', name: 'C', population: 100, fieldCount: 1, grainSacks: 0 });
  c.fields[0].status = FieldStatus.Grain;
  c.fields[0].sacksPlanted = 5;
  c.fields[0].grainGrowth = 1;
  c.labour.industryShare = 0;
  const s = runProduction(c, allocateLabour(c), treasury(), Season.Fall);
  const expected = 5 * GRAIN_YIELD_MULTIPLIER; // 5 sacks sown, full labour
  assertClose(s.grainHarvested, expected, 0.001, 'sacks sown * yield multiplier');
  assertClose(c.food.grainSacks, expected, 0.001, 'harvest banked locally');
});
