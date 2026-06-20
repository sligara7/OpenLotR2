/* Shared lookups/validation for command handlers. */

import type { GameState } from '../../types/realm.ts';
import type { County } from '../../types/county.ts';
import type { Army } from '../../types/army.ts';

export interface OwnedLookup {
  county?: County;
  error?: string;
}

export interface OwnedArmyLookup {
  army?: Army;
  error?: string;
}

/** Resolve an army and assert the actor controls it. */
export function findOwnedArmy(
  state: GameState,
  armyId: string,
  actorRealmId: string,
): OwnedArmyLookup {
  const army = state.armies[armyId];
  if (!army) return { error: `Unknown army: ${armyId}` };
  if (army.ownerId !== actorRealmId) return { error: 'That army is not yours' };
  return { army };
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
