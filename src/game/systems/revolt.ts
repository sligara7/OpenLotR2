/*
 * Revolts (Manual Part-3 "Happiness").
 *
 * If happiness sits at/near zero for too long the county revolts: it leaves the
 * ruler's control and (in the full game) spawns a roving band of brigands.
 * Here we track the unrest countdown and flip ownership; recapturing the county
 * town is what reclaims it (handled later by the conquest system).
 *
 * FUTURE: spawn a brigand army entity that wanders and depresses neighbouring
 * happiness, and allow re-capture to clear `revolting`.
 */

import { REVOLT_PATIENCE, REVOLT_THRESHOLD } from '../constants.ts';
import type { County } from '../types/county.ts';

export interface RevoltResult {
  revoltTriggered: boolean;
}

export function updateRevolt(county: County): RevoltResult {
  if (county.happiness <= REVOLT_THRESHOLD) {
    county.unrestSeasons += 1;
  } else {
    county.unrestSeasons = 0;
  }

  if (!county.revolting && county.unrestSeasons >= REVOLT_PATIENCE) {
    county.revolting = true;
    county.ownerId = null; // county is lost until recaptured
    return { revoltTriggered: true };
  }
  return { revoltTriggered: false };
}
