/*
 * Seed corn and breeding stock — the reserves that break the absorbing states.
 *
 * Every productive stock here is a multiplicative loop (grain is sown from
 * grain, a herd grows from the herd), so a stock eaten to zero is dead for the
 * rest of the game. Measured before these reserves existed: 511 of 4,100
 * sowings planted nothing, 44 of 82 counties failed to sow at least once, and
 * by turn 200 three counties held no grain and seventeen held no cattle.
 *
 * After: no county ends at zero grain, and the only counties without a herd are
 * the six that never had a pasture to keep one in.
 */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { feedPopulation } from '../systems/food.ts';
import { drawFood } from '../systems/foraging.ts';
import {
  breedingReserve, edibleGrain, seedReserve, slaughterableCows,
} from '../systems/reserves.ts';
import { createCounty } from '../state/county.ts';
import { CATTLE_BREEDING_STOCK, GRAIN_SACKS_PER_FIELD } from '../constants.ts';
import { FieldStatus, RationLevel } from '../types/enums.ts';
import type { County } from '../types/county.ts';

/** A county with `grain` sacks, `cows` head, and fields of each kind. */
function farm(pop: number, grain: number, cows: number, grainFields = 3, cattleFields = 2): County {
  const c = createCounty({ id: 'c1', name: 'Test', population: pop, grainSacks: grain, cows });
  c.wantedRation = RationLevel.Normal;
  c.labour.grainBeefBalance = 1; // willing to slaughter, so only the reserve stops it
  for (let i = 0; i < c.fields.length; i += 1) {
    c.fields[i].status =
      i < grainFields ? FieldStatus.Grain
        : i < grainFields + cattleFields ? FieldStatus.Cattle
          : FieldStatus.Barren;
  }
  return c;
}

test('reserves: the seed is what the fields need to sow', () => {
  const c = farm(100, 1000, 10, 4, 0);

  assertEqual(seedReserve(c), 4 * GRAIN_SACKS_PER_FIELD, 'one sowing for every grain field');
});

test('reserves: a county with no grain fields has no seed to protect', () => {
  const c = farm(100, 1000, 10, 0, 2);

  assertEqual(seedReserve(c), 0, 'nothing to sow, nothing to keep back');
  assertEqual(edibleGrain(c), 1000, 'so the whole store is food');
});

test('reserves: hunger stops at the seed corn', () => {
  const seed = 3 * GRAIN_SACKS_PER_FIELD;
  const c = farm(100_000, seed + 40, 0, 3, 0); // demand far beyond the store

  feedPopulation(c, 0);

  assertEqual(c.food.grainSacks, seed, 'the people went hungry and the farm survived');
});

test('reserves: the people DO go hungry rather than eat it', () => {
  const seed = 3 * GRAIN_SACKS_PER_FIELD;
  const c = farm(1000, seed, 0, 3, 0); // nothing above the seed at all

  const r = feedPopulation(c, 0);

  assertEqual(r.grainServed, 0, 'not one sack was eaten');
  assertEqual(r.achievedRation, RationLevel.None, 'and they starved for it');
});

test('reserves: slaughter stops at the breeding stock', () => {
  const c = farm(100_000, 0, CATTLE_BREEDING_STOCK + 10, 0, 2);

  feedPopulation(c, 0);

  assertEqual(c.food.cows, CATTLE_BREEDING_STOCK, 'a remnant is always left to breed from');
});

test('reserves: a county with no pasture keeps no breeding stock', () => {
  const c = farm(100_000, 0, 8, 3, 0);

  assertEqual(breedingReserve(c), 0, 'no grass, no herd to protect');
  feedPopulation(c, 0);
  assertEqual(c.food.cows, 0, 'so the last of them can be eaten');
});

test('reserves: a foraging army strips the surplus and leaves the seed', () => {
  const seed = 3 * GRAIN_SACKS_PER_FIELD;
  const c = farm(100, seed + 60, CATTLE_BREEDING_STOCK + 5, 3, 2);

  const served = drawFood(c, 100_000); // a host far larger than the county can feed

  assertGreater(served, 0, 'the army ate what there was');
  assertEqual(c.food.grainSacks, seed, 'but left next year in the ground');
  assertEqual(c.food.cows, CATTLE_BREEDING_STOCK, 'and left the breeding stock');
});

test('reserves: an occupied county can still sow next winter', () => {
  // The whole point. Before the reserve, a host wintering on a county left it
  // with nothing to plant, and a county that misses a sowing loses the year —
  // which makes the next sowing likelier to fail. That spiral is what ruined
  // contested counties permanently.
  const c = farm(100, 5000, 20, 3, 2);

  drawFood(c, 100_000);

  assert(c.food.grainSacks >= seedReserve(c), 'there is seed for the spring');
  assertGreater(slaughterableCows(c) + breedingReserve(c), 0, 'and a herd to build back');
});
