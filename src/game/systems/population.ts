/*
 * Population dynamics within a single county (Manual Part-3 "Population
 * Growth"). Inter-county movement lives in immigration.ts; plague deaths are
 * applied in health.ts. Here:
 *   - Births scale with happiness; an occasional baby boom multiplies them.
 *   - Deaths scale with poor health.
 *   - Emigration: an unhappy populace (below a pivot) drains away.
 *
 * FUTURE: emigration here (absolute-misery outflow) and immigration.ts
 * (neighbour gradient flow) overlap conceptually — consider unifying so that
 * emigrants are routed to specific happier counties rather than just lost.
 */

import { POP } from '../constants.ts';
import type { County } from '../types/county.ts';
import type { Rng } from '../rng.ts';

export interface PopulationResult {
  births: number;
  deaths: number;
  emigrants: number;
  babyBoom: boolean;
}

export function updatePopulation(county: County, rng: Rng): PopulationResult {
  const pop = county.population;

  let births = pop * (POP.birthRateBase + POP.birthRateHappy * (county.happiness / 100));
  const babyBoom = rng.chance(POP.babyBoomChance);
  if (babyBoom) births *= POP.babyBoomMultiplier;

  const deaths = pop * (POP.deathRateBase + POP.deathRatePoorHealth * (1 - county.health / 100));

  let emigrants = 0;
  if (county.happiness < POP.emigrationPivot) {
    emigrants = pop * (POP.emigrationPivot - county.happiness) * POP.emigrationRatePerPoint;
  }

  const net = births - deaths - emigrants;
  county.population = Math.max(0, Math.round(pop + net));

  return {
    births: Math.round(births),
    deaths: Math.round(deaths),
    emigrants: Math.round(emigrants),
    babyBoom,
  };
}
