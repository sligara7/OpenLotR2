/*
 * Food & rations (Manual Part-3 "Food", "Milk, Beef, or Bread?").
 *
 * CATTLE ARE A DAIRY HERD, NOT A LARDER. A living cow feeds people every season
 * and can go on doing it for years; a slaughtered one feeds them once. So the
 * order of consumption is dairy, then grain, and only then beef — and beef only
 * as deep into the herd as the ration slider permits.
 *
 * ⚠️ IT USED TO SPLIT DEMAND BETWEEN GRAIN AND BEEF BY THE SLIDER, and the
 * arithmetic of that was impossible. At the default balance of 0.5 a county of
 * 770 wanted half its diet from beef — 96 head a season against a starting herd
 * of 32, which grew at best 1.6 a season once the crowding term was applied. So
 * herds were eaten in a single season, and because growth is `cows * (1 +
 * growth)` a herd at zero is an absorbing state that can never recover. Measured
 * over a full game: all 2,936 cattle in Britain, across 76 of 82 counties, were
 * dead by turn 25 and none ever came back — taking the dairy stream with them,
 * since production gates dairy on `cows > 0`. Three food sources became one by
 * year six of every game ever played.
 *
 * Order of consumption each season:
 *   1. Dairy, automatically, from the living herd (cannot be stored; surplus
 *      spoils). This is what cattle are FOR.
 *   2. Grain from the barns.
 *   3. Beef, last, and only up to the share of the herd the slider is willing
 *      to put under the knife. Slaughtering a milk cow is eating next year's
 *      food, so it is what a county does when the barns are empty — a famine
 *      measure, not a diet.
 * The *achieved* ration may be lower than the *wanted* ration when food runs
 * out; achievedMult (portions served per person) feeds health & happiness.
 */

import { RATION_MULTIPLIER, RationLevel } from '../types/enums.ts';
import {
  BEEF_PORTIONS_PER_COW,
  GRAIN_SACKS_PER_PORTION,
} from '../constants.ts';
import type { County } from '../types/county.ts';

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export interface FoodResult {
  /** Portions actually served per person (Normal == 1). */
  achievedMult: number;
  achievedRation: RationLevel;
  dairyServed: number;
  grainServed: number;
  beefServed: number;
}

/** Highest ration level whose multiplier the achieved portions can sustain. */
function rationForMultiplier(mult: number): RationLevel {
  const order: RationLevel[] = [
    RationLevel.Triple,
    RationLevel.Double,
    RationLevel.Normal,
    RationLevel.Half,
    RationLevel.Quarter,
    RationLevel.None,
  ];
  for (const level of order) {
    if (mult + 1e-9 >= RATION_MULTIPLIER[level]) return level;
  }
  return RationLevel.None;
}

/**
 * Feed the county for the season.
 * @param dairyPortions people this season's dairy can feed (from production;
 *   transient — dairy is never stored, so it is passed in, not held on state).
 */
export function feedPopulation(county: County, dairyPortions: number): FoodResult {
  const pop = county.population;
  const wantedMult = RATION_MULTIPLIER[county.wantedRation];
  const totalWanted = pop * wantedMult;

  // 1. Dairy (auto, non-storable).
  const dairyServed = Math.min(dairyPortions, totalWanted);
  let need = Math.max(0, totalWanted - dairyServed);

  // 2. Grain from the barns covers what dairy could not.
  const grainAvail = county.food.grainSacks / GRAIN_SACKS_PER_PORTION;
  const grainServed = Math.min(need, grainAvail);
  need -= grainServed;

  // 3. Beef last. The slider is now WILLINGNESS TO SLAUGHTER, not a diet split:
  // it caps how much of the herd may go under the knife this season. At 0 the
  // county would rather go hungry than eat its herd; at 1 it will kill whatever
  // it takes. Either way nothing is slaughtered while the barns hold grain.
  const willing = clamp01(county.labour.grainBeefBalance);
  const beefAvail = county.food.cows * willing * BEEF_PORTIONS_PER_COW;
  const beefServed = Math.min(need, beefAvail);
  need -= beefServed;

  // Commit consumption to stores (dairy surplus simply spoils).
  county.food.grainSacks -= grainServed * GRAIN_SACKS_PER_PORTION;
  county.food.cows = Math.max(0, county.food.cows - beefServed / BEEF_PORTIONS_PER_COW);

  const served = dairyServed + grainServed + beefServed;
  const achievedMult = pop > 0 ? served / pop : wantedMult;
  const achievedRation = rationForMultiplier(achievedMult);
  county.achievedRation = achievedRation;

  return { achievedMult, achievedRation, dairyServed, grainServed, beefServed };
}
