/*
 * Cattle are a dairy herd, not a larder.
 *
 * These guard the arithmetic that used to be impossible. The old model split
 * demand between grain and beef by the ration slider, so at the default 0.5 a
 * county of 770 wanted half its diet from beef: 96 head a season against a
 * starting herd of 32 that grew at best 1.6. Every herd in Britain — 2,936 head
 * across 76 of 82 counties — was dead by turn 25 of every game, and since herd
 * growth is `cows * (1 + growth)`, zero is an absorbing state nothing recovers
 * from. Dairy died with the herd, because production gates it on `cows > 0`.
 */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { feedPopulation } from '../systems/food.ts';
import { createCounty } from '../state/county.ts';
import { BEEF_PORTIONS_PER_COW, DAIRY_PORTIONS_PER_COW, GRAIN_SACKS_PER_PORTION } from '../constants.ts';
import { RationLevel } from '../types/enums.ts';
import type { County } from '../types/county.ts';

/** A county of `pop` people with `grain` sacks and `cows` head. */
function county(pop: number, grain: number, cows: number, willing = 0.5): County {
  const c = createCounty({ id: 'c1', name: 'Test', population: pop, grainSacks: grain, cows });
  c.wantedRation = RationLevel.Normal;
  c.labour.grainBeefBalance = willing;
  return c;
}

test('cattle: a full barn means not one cow is slaughtered', () => {
  const c = county(1000, 5000, 40);
  const before = c.food.cows;

  const r = feedPopulation(c, 0);

  assertEqual(c.food.cows, before, 'the herd is untouched while there is grain');
  assertEqual(r.beefServed, 0, 'and no beef was served');
  assertEqual(r.achievedRation, RationLevel.Normal, 'the people ate normally');
});

test('cattle: the herd is eaten only when the barns are empty', () => {
  const c = county(1000, 0, 40);

  const r = feedPopulation(c, 0);

  assertGreater(r.beefServed, 0, 'with no grain the herd goes under the knife');
  assert(c.food.cows < 40, 'and the herd is smaller for it');
});

test('cattle: the slider caps how deep into the herd a famine cuts', () => {
  const spare = county(1000, 0, 40, 0);
  const free = county(1000, 0, 40, 1);

  feedPopulation(spare, 0);
  feedPopulation(free, 0);

  assertEqual(spare.food.cows, 40, 'at 0 the county starves rather than eat its herd');
  assert(free.food.cows < 40, 'at 1 it kills whatever hunger demands');
});

test('cattle: at willingness 0 the people go hungry instead', () => {
  const c = county(1000, 0, 40, 0);

  const r = feedPopulation(c, 0);

  assertEqual(r.achievedRation, RationLevel.None, 'nothing was eaten');
  assertEqual(c.food.cows, 40, 'because the herd was spared');
});

test('cattle: only the willing share may be slaughtered in one season', () => {
  // Demand far exceeds what half the herd can cover, so the cap binds.
  const c = county(10_000, 0, 40, 0.5);

  feedPopulation(c, 0);

  assertEqual(c.food.cows, 20, 'half the herd, and not one more');
});

test('cattle: dairy feeds people before anything is drawn from store', () => {
  const c = county(100, 1000, 40);
  const grainBefore = c.food.grainSacks;

  const r = feedPopulation(c, 100); // dairy covers the whole county

  assertEqual(r.dairyServed, 100, 'the herd fed them by being alive');
  assertEqual(c.food.grainSacks, grainBefore, 'so the barn was never opened');
  assertEqual(c.food.cows, 40, 'and the herd is whole');
});

test('cattle: a living cow is worth keeping against her own carcass', () => {
  // The ratio that decides whether eating the herd is ever correct. A cow
  // slaughtered feeds BEEF_PORTIONS_PER_COW people once; alive she feeds
  // DAIRY_PORTIONS_PER_COW every season, so she repays the carcass inside two
  // years. At the old 1.2 it took over three years and eating her always won.
  const seasonsToRepay = BEEF_PORTIONS_PER_COW / DAIRY_PORTIONS_PER_COW;

  assert(
    seasonsToRepay <= 4,
    `a living cow must repay her carcass within a year, not ${seasonsToRepay.toFixed(1)} seasons`,
  );
});

test('cattle: grain still feeds people on its own when there is no herd', () => {
  const c = county(1000, 5000, 0);

  const r = feedPopulation(c, 0);

  assertEqual(r.achievedRation, RationLevel.Normal, 'a county with no cattle is not doomed');
  assertEqual(r.grainServed, 1000 / GRAIN_SACKS_PER_PORTION, 'grain covered the whole need');
});
