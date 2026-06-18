/*
 * Health (Manual Part-3 "Health").
 *
 * Health is a 0..100 scalar that drifts toward a target set by the achieved
 * ration (Normal+ keeps people healthy; Half/Quarter erode it). Plague is a
 * random, unpreventable shock. The scalar is bucketed to the five display
 * levels (Diseased..Perfect) for the UI and for happiness.
 */

import { HEALTH_DRIFT, HEALTH_TARGET_BY_RATION, PLAGUE } from '../constants.ts';
import { healthLevelFor } from '../state/county.ts';
import type { County } from '../types/county.ts';
import type { RationLevel } from '../types/enums.ts';
import type { Rng } from '../rng.ts';

export interface HealthResult {
  plague: boolean;
  /** People killed by plague this season (0 if none). */
  plagueDeaths: number;
}

export function updateHealth(
  county: County,
  achievedRation: RationLevel,
  rng: Rng,
): HealthResult {
  const target = HEALTH_TARGET_BY_RATION[achievedRation] ?? 0;
  const diff = target - county.health;
  const step = Math.sign(diff) * Math.min(Math.abs(diff), HEALTH_DRIFT);
  county.health = clamp(county.health + step, 0, 100);

  const result: HealthResult = { plague: false, plagueDeaths: 0 };
  if (rng.chance(PLAGUE.chancePerSeason)) {
    result.plague = true;
    result.plagueDeaths = Math.round(county.population * PLAGUE.popKillFraction);
    county.population = Math.max(0, county.population - result.plagueDeaths);
    county.health = clamp(county.health - PLAGUE.healthHit, 0, 100);
  }

  county.healthLabel = healthLevelFor(county.health);
  return result;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
