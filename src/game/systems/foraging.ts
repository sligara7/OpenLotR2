/*
 * Foraging & starvation (armies live off the land).
 *
 * Each season every army forages from the county it occupies (army.countyId),
 * eating grain then beef from that county's local stores. This draws the stores
 * down — an occupying force weakens the county it sits on, whether friendly or
 * foe. When the occupied county cannot meet the army's appetite (barren land,
 * enemy territory stripped bare, or no county at all), the shortfall starves a
 * fraction of the unfed soldiers; an army reduced to zero soldiers is destroyed
 * and removed from the world.
 *
 * This is the first half of logistics. Supply convoys — feeding an army from the
 * realm's treasury across friendly tiles, and intercepting an enemy's convoys —
 * are a future system; for now, occupation is the only supply line.
 */

import {
  ARMY_FORAGE_PORTIONS_PER_SOLDIER,
  ARMY_STARVE_FRACTION,
  BEEF_PORTIONS_PER_COW,
  GRAIN_SACKS_PER_PORTION,
} from '../constants.ts';
import type { GameState } from '../types/realm.ts';
import type { County } from '../types/county.ts';

export interface ArmyForageResult {
  armyId: string;
  countyId: string | null;
  /** Food the army needed this season, in portions. */
  needed: number;
  /** Food actually foraged from the occupied county, in portions. */
  foraged: number;
  /** Soldiers lost to starvation this season. */
  starved: number;
  /** True if the army was wiped out (and removed from state.armies). */
  destroyed: boolean;
}

export interface ForageLedger {
  armies: ArmyForageResult[];
}

/** Draw up to `need` portions of food from a county's stores (grain first, then
 *  beef). Mutates the county's food in place; returns portions actually served.
 *  Uses the same conversion constants as the population's own consumption.
 *  Exported so a besieged garrison can eat from the same stores (systems/siege). */
export function drawFood(county: County, need: number): number {
  let remaining = need;

  const grainAvail = county.food.grainSacks / GRAIN_SACKS_PER_PORTION;
  const grainServed = Math.min(remaining, grainAvail);
  county.food.grainSacks -= grainServed * GRAIN_SACKS_PER_PORTION;
  remaining -= grainServed;

  const beefAvail = county.food.cows * BEEF_PORTIONS_PER_COW;
  const beefServed = Math.min(remaining, beefAvail);
  county.food.cows = Math.max(0, county.food.cows - beefServed / BEEF_PORTIONS_PER_COW);
  remaining -= beefServed;

  return need - remaining;
}

/**
 * Resolve foraging & starvation for every army. Run as a world-level step after
 * counties have fed their own people, so armies draw down what is left in store.
 * Destroyed armies are removed from `state.armies`.
 */
export function forageArmies(state: GameState): ForageLedger {
  const results: ArmyForageResult[] = [];

  for (const army of Object.values(state.armies)) {
    const needed = army.soldiers * ARMY_FORAGE_PORTIONS_PER_SOLDIER;
    const county = army.countyId ? state.counties[army.countyId] : undefined;
    const foraged = county ? drawFood(county, needed) : 0;

    const shortfall = needed - foraged;
    let starved = 0;
    if (shortfall > 1e-9) {
      // Round UP so any genuine shortfall costs at least one soldier — an
      // unsupplied army always bleeds, and a tiny remnant eventually dies out.
      const unfed = shortfall / ARMY_FORAGE_PORTIONS_PER_SOLDIER;
      starved = Math.min(army.soldiers, Math.ceil(unfed * ARMY_STARVE_FRACTION));
      army.soldiers -= starved;
    }

    const destroyed = army.soldiers <= 0;
    if (destroyed) delete state.armies[army.id];

    results.push({ armyId: army.id, countyId: army.countyId, needed, foraged, starved, destroyed });
  }

  return { armies: results };
}
