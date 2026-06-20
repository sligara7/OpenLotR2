/*
 * Conquest — a county changing hands, and realms falling out of the game.
 *
 * Shared by both routes to ownership: occupying an undefended county town
 * (commands/handlers/army.ts) and winning a siege (systems/siege.ts). Kept in
 * one place so the side effects of a capture — resentful populace, lifted siege,
 * possible elimination of the loser — stay consistent however the county falls.
 */

import { CONQUEST } from '../constants.ts';
import type { GameState } from '../types/realm.ts';

/**
 * Transfer a county to a new owner. The defeated garrison is gone (set to 0),
 * the conquered populace turns resentful, and any siege on the county lifts.
 * Castle type and damage persist (you capture the walls, cracks and all).
 */
export function captureCounty(state: GameState, countyId: string, newOwnerId: string): void {
  const county = state.counties[countyId];
  if (!county) return;

  county.ownerId = newOwnerId;
  county.castle.garrison = 0;
  county.happiness = Math.min(county.happiness, CONQUEST.conqueredHappiness);
  county.revolting = false;
  county.unrestSeasons = 0;

  delete state.sieges[countyId];
}

/** Is a realm still in the game (holds at least one county or army)? */
export function realmIsAlive(state: GameState, realmId: string): boolean {
  for (const c of Object.values(state.counties)) if (c.ownerId === realmId) return true;
  for (const a of Object.values(state.armies)) if (a.ownerId === realmId) return true;
  return false;
}

/** Flag realms that now hold nothing as eliminated. Returns the newly fallen. */
export function updateEliminations(state: GameState): string[] {
  const fallen: string[] = [];
  for (const realm of Object.values(state.realms)) {
    if (!realm.eliminated && !realmIsAlive(state, realm.id)) {
      realm.eliminated = true;
      fallen.push(realm.id);
    }
  }
  return fallen;
}
