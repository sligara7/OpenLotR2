/*
 * Seed corn and breeding stock — what a county may never eat.
 *
 * THE PATTERN THIS EXISTS TO BREAK. Every productive stock in the game is a
 * multiplicative loop: grain is sown from grain, a herd grows from the herd,
 * births are a fraction of the population. A loop like that has no way back
 * from zero, so any stock eaten to nothing is dead for the rest of the game.
 * Measured across one full game before this existed: 511 of 4,100 sowings
 * planted NOTHING — one in eight — because the store had been eaten down before
 * Winter came, and 44 of Britain's 82 counties failed to sow at least once. A
 * county that misses a sowing loses the whole year's harvest, which makes the
 * next sowing likelier to fail. The famine was a spiral, not a shortage.
 *
 * The answer is the oldest one in agriculture: the seed corn is sacrosanct.
 * Peasants starved rather than eat it, because eating the seed does not end
 * hunger, it ends the farm. The same logic covers the herd — kill the last cows
 * and there is no herd next year, whatever happens to the grass.
 *
 * So hunger takes what is above the reserve and stops. People go short, health
 * and happiness fall, some die or leave — all of which the county can recover
 * from. Losing the farm is the one thing it cannot.
 *
 * Applied to ARMIES TOO, deliberately. Foraging draws through the same reserve,
 * so an occupying host strips the surplus and leaves the seed. Letting armies
 * take it would be more realistic and would restore the trap in exactly the
 * counties that matter — the contested ones, which is where every ruined county
 * in the measurements actually was.
 */

import { CATTLE_BREEDING_STOCK, GRAIN_SACKS_PER_FIELD } from '../constants.ts';
import { FieldStatus } from '../types/enums.ts';
import type { County } from '../types/county.ts';

/**
 * Sacks the county must keep back to sow its grain fields next Winter. Nothing
 * may eat into this — not the population, not a foraging army, not a besieged
 * garrison. A county with no grain fields has no seed to protect.
 */
export function seedReserve(county: County): number {
  const fields = county.fields.filter((f) => f.status === FieldStatus.Grain).length;
  return fields * GRAIN_SACKS_PER_FIELD;
}

/**
 * Head the county must keep back to breed the herd back up. Small on purpose:
 * this is a remnant that makes recovery possible over years, not a herd anyone
 * can live off. A county with no cattle fields cannot keep cattle at all.
 */
export function breedingReserve(county: County): number {
  const fields = county.fields.filter((f) => f.status === FieldStatus.Cattle).length;
  return fields > 0 ? CATTLE_BREEDING_STOCK : 0;
}

/** Grain sacks that may actually be eaten — the store above the seed corn. */
export function edibleGrain(county: County): number {
  return Math.max(0, county.food.grainSacks - seedReserve(county));
}

/** Cattle that may actually be slaughtered — the herd above the breeding stock. */
export function slaughterableCows(county: County): number {
  return Math.max(0, county.food.cows - breedingReserve(county));
}
