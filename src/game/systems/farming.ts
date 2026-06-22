/*
 * Advanced Farming (Manual Part-8). When GameOptions.advancedFarming is on,
 * grain becomes a more demanding crop:
 *
 *   - Weather: each season rolls a weather that scales the grain harvest —
 *     drought undercuts it, sunny seasons improve it. Its effect accumulates
 *     over the growing season (folded into each field's grainGrowth, which the
 *     harvest then reads), so a dry spring still hurts the autumn yield.
 *   - Fertility: hold ~a third of usable fields fallow and the soil stays
 *     fertile; over-crop it and fertility — and the harvest — decline.
 *   - Seasonal labour: grain wants few hands in spring/summer and a great many
 *     at the autumn harvest (production.ts reads seasonalGrainDemand).
 *
 * `advanceFarming` runs once per county per season BEFORE production, setting
 * this season's weather and easing fertility toward its target. The rest are
 * pure helpers production.ts and the engine consult. With the option off none
 * of this runs: weather stays Mild, fertility 1, labour demand flat.
 */

import { ADVANCED_FARMING } from '../constants.ts';
import { FieldStatus, Season, Weather } from '../types/enums.ts';
import type { County } from '../types/county.ts';
import type { Rng } from '../rng.ts';

const WEATHERS: Weather[] = [Weather.Drought, Weather.Poor, Weather.Mild, Weather.Fair, Weather.Sunny];

/** Roll a season's weather from the weighted table. */
export function rollWeather(rng: Rng): Weather {
  const total = WEATHERS.reduce((s, w) => s + ADVANCED_FARMING.weather[w].weight, 0);
  let pick = rng.next() * total;
  for (const w of WEATHERS) {
    pick -= ADVANCED_FARMING.weather[w].weight;
    if (pick < 0) return w;
  }
  return Weather.Mild;
}

/** The yield multiplier a given weather applies to grain. */
export function weatherYieldFactor(weather: Weather): number {
  return ADVANCED_FARMING.weather[weather].yield;
}

/** Grain workers needed per field this season, relative to the flat demand. */
export function seasonalGrainDemand(season: Season): number {
  return ADVANCED_FARMING.seasonalLabour[season];
}

/** Fraction of usable (non-barren) fields currently left fallow. */
function fallowRatio(county: County): number {
  let usable = 0;
  let fallow = 0;
  for (const f of county.fields) {
    if (f.status === FieldStatus.Barren) continue;
    usable += 1;
    if (f.status === FieldStatus.Fallow) fallow += 1;
  }
  return usable === 0 ? 1 : fallow / usable;
}

/** Ease fertility toward the target implied by how much land is left fallow:
 *  at/above the ideal fallow share it climbs toward 1, below it sinks toward
 *  the floor in proportion to the shortfall. */
export function updateFertility(county: County): void {
  const ratio = fallowRatio(county);
  const ideal = ADVANCED_FARMING.idealFallow;
  const target = ratio >= ideal
    ? 1
    : ADVANCED_FARMING.fertilityFloor +
      (1 - ADVANCED_FARMING.fertilityFloor) * (ratio / ideal);
  county.fertility += (target - county.fertility) * ADVANCED_FARMING.fertilityStep;
}

/** The yield multiplier the current fertility applies to grain. */
export function fertilityYieldFactor(county: County): number {
  return county.fertility;
}

/** Per-season advanced-farming upkeep for one county: set the weather and ease
 *  fertility. Runs before production so the harvest sees this season's values. */
export function advanceFarming(county: County, rng: Rng): void {
  county.weather = rollWeather(rng);
  updateFertility(county);
}
