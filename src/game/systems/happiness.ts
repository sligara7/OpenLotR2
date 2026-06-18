/*
 * Happiness (Manual Part-3 "Happiness").
 *
 * Each season happiness moves by the sum of per-factor deltas — taxes, health,
 * rations, conscription, ale and events — then clamps to 0..100. The manual's
 * Happiness Report shows exactly these per-factor contributions, so we record
 * them on the county (lastHappinessDelta) for that UI.
 *
 * FUTURE: instead of raw additive drift (which can peg at the clamp), move
 * happiness toward a computed target for gentler equilibria.
 */

import { RATION_MULTIPLIER, RationLevel } from '../types/enums.ts';
import { HAPPINESS, TAX_TOLERANCE } from '../constants.ts';
import type { County, HappinessDelta } from '../types/county.ts';

/** Ration steps relative to Normal: None=-3 .. Normal=0 .. Triple=+2. */
function rationSteps(level: RationLevel): number {
  const ladder: RationLevel[] = [
    RationLevel.None,
    RationLevel.Quarter,
    RationLevel.Half,
    RationLevel.Normal,
    RationLevel.Double,
    RationLevel.Triple,
  ];
  return ladder.indexOf(level) - ladder.indexOf(RationLevel.Normal);
}

export function updateHappiness(county: County): HappinessDelta {
  const d: HappinessDelta = { taxes: 0, health: 0, rations: 0, conscription: 0, events: 0, ale: 0 };

  // Taxes: penalty above tolerance, mild reward below it.
  if (county.taxRate > TAX_TOLERANCE) {
    d.taxes = -(county.taxRate - TAX_TOLERANCE) * HAPPINESS.taxPenaltyPerPoint;
  } else {
    d.taxes = (TAX_TOLERANCE - county.taxRate) * HAPPINESS.lowTaxReward;
  }

  // Health: healthy populace cheers up, sick one sours.
  d.health = ((county.health - 50) / 50) * HAPPINESS.healthScale;

  // Rations: at/above Normal lifts, below Normal hurts (steeper).
  const steps = rationSteps(county.achievedRation);
  d.rations = steps >= 0 ? steps * HAPPINESS.rationBonusNormalPlus : steps * HAPPINESS.rationPenaltyBelowNormal;

  // Conscription: penalty proportional to the share of pop drafted this season.
  if (county.population > 0 && county.recentConscription > 0) {
    const pct = (county.recentConscription / county.population) * 100;
    d.conscription = -pct * HAPPINESS.conscriptionPenaltyPerPct;
  }

  // Ale: temporary flat boost while it lasts.
  if (county.aleSeasons > 0) d.ale = HAPPINESS.aleBonus;

  // Events: an active revolt depresses happiness further.
  if (county.revolting) d.events = -HAPPINESS.revoltPenalty;

  const total = d.taxes + d.health + d.rations + d.conscription + d.ale + d.events;
  county.happiness = Math.max(0, Math.min(100, county.happiness + total));
  county.lastHappinessDelta = d;
  return d;
}

/** Ration multiplier lookup re-exported for callers/tests that want it. */
export function rationMultiplier(level: RationLevel): number {
  return RATION_MULTIPLIER[level];
}
