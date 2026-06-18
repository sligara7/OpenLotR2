/* Shared lookups/validation for command handlers. */

import type { GameState } from '../../types/realm.ts';
import type { County } from '../../types/county.ts';

export interface OwnedLookup {
  county?: County;
  error?: string;
}

/** Resolve a county and assert the actor controls it. */
export function findOwnedCounty(
  state: GameState,
  countyId: string,
  actorRealmId: string,
): OwnedLookup {
  const county = state.counties[countyId];
  if (!county) return { error: `Unknown county: ${countyId}` };
  if (county.ownerId !== actorRealmId) {
    return { error: `County ${countyId} is not controlled by ${actorRealmId}` };
  }
  return { county };
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
