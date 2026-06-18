/*
 * Immigration — inter-county population flow (Manual Part-3 "Population
 * Growth"): "Immigrants will move from counties whose happiness is low to
 * counties where it is high. The larger the difference in happiness between
 * neighboring counties, the more people will move to the happier county."
 *
 * Centrally located counties (more neighbours) naturally attract more people,
 * because each adjacency contributes an independent inflow — this reproduces
 * the manual's note without any special-casing.
 *
 * Flows are computed from a snapshot and applied afterwards, so the result is
 * independent of county iteration order and conserves people across the map.
 */

import { IMMIGRATION } from '../constants.ts';
import type { GameState } from '../types/realm.ts';

export type MigrationLedger = Record<string, number>;

export function runImmigration(state: GameState): MigrationLedger {
  const ledger: MigrationLedger = {};
  for (const id of Object.keys(state.counties)) ledger[id] = 0;

  // Snapshot happiness so flows don't cascade within a single season.
  const happiness: Record<string, number> = {};
  const popSnapshot: Record<string, number> = {};
  for (const c of Object.values(state.counties)) {
    happiness[c.id] = c.happiness;
    popSnapshot[c.id] = c.population;
  }

  const seen = new Set<string>();
  for (const a of Object.keys(state.adjacency)) {
    for (const b of state.adjacency[a]) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const gap = Math.abs(happiness[a] - happiness[b]);
      if (gap < IMMIGRATION.minGap) continue;

      const [from, to] = happiness[a] < happiness[b] ? [a, b] : [b, a];
      // Move a fraction of the source's people proportional to the gap.
      const movers = Math.min(
        popSnapshot[from],
        Math.round(popSnapshot[from] * gap * IMMIGRATION.ratePerHappinessGap),
      );
      ledger[from] -= movers;
      ledger[to] += movers;
    }
  }

  for (const c of Object.values(state.counties)) {
    c.population = Math.max(0, c.population + ledger[c.id]);
  }
  return ledger;
}
