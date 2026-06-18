/*
 * Food & rations (Manual Part-3 "Food", "Milk, Beef, or Bread?").
 *
 * Order of consumption each season:
 *   1. Dairy is eaten automatically (cannot be stored; surplus spoils).
 *   2. The remaining demand is split between grain and beef via the ration
 *      slider (grainBeefBalance). If one source is short, the other covers the
 *      shortfall where it can — people eat what's available.
 * The *achieved* ration may be lower than the *wanted* ration when food runs
 * out; achievedMult (portions served per person) feeds health & happiness.
 */

import { RATION_MULTIPLIER, RationLevel } from '../types/enums.ts';
import {
  BEEF_PORTIONS_PER_COW,
  GRAIN_SACKS_PER_PORTION,
} from '../constants.ts';
import type { County } from '../types/county.ts';

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

  // 2. Split the rest grain/beef per the slider, with cross-cover on shortfall.
  const balance = county.labour.grainBeefBalance; // 0 grain .. 1 beef
  let grainAvail = county.food.grainSacks / GRAIN_SACKS_PER_PORTION;
  let beefAvail = county.food.cows * BEEF_PORTIONS_PER_COW;

  let grainServed = Math.min(need * (1 - balance), grainAvail);
  let beefServed = Math.min(need * balance, beefAvail);
  grainAvail -= grainServed;
  beefAvail -= beefServed;
  need -= grainServed + beefServed;

  // Cross-cover: whichever source has slack absorbs the leftover demand.
  if (need > 0 && grainAvail > 0) {
    const extra = Math.min(need, grainAvail);
    grainServed += extra;
    need -= extra;
  }
  if (need > 0 && beefAvail > 0) {
    const extra = Math.min(need, beefAvail);
    beefServed += extra;
    need -= extra;
  }

  // Commit consumption to stores (dairy surplus simply spoils).
  county.food.grainSacks -= grainServed * GRAIN_SACKS_PER_PORTION;
  county.food.cows = Math.max(0, county.food.cows - beefServed / BEEF_PORTIONS_PER_COW);

  const served = dairyServed + grainServed + beefServed;
  const achievedMult = pop > 0 ? served / pop : wantedMult;
  const achievedRation = rationForMultiplier(achievedMult);
  county.achievedRation = achievedRation;

  return { achievedMult, achievedRation, dairyServed, grainServed, beefServed };
}
