/*
 * Conquest — a county changing hands, and realms falling out of the game.
 *
 * Shared by both routes to ownership: occupying an undefended county town
 * (commands/handlers/army.ts) and winning a siege (systems/siege.ts). Kept in
 * one place so the side effects of a capture — resentful populace, lifted siege,
 * possible elimination of the loser — stay consistent however the county falls.
 */

import { CONQUEST } from '../constants.ts';
import type { GameState, GameOutcome } from '../types/realm.ts';

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
  // Occupy: held under the garrison's order for a few seasons, so a brief
  // post-conquest dip can't immediately flip the county back to neutral.
  county.pacifiedSeasons = CONQUEST.pacifySeasons;

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

/** Count of counties a realm holds. */
function countyCount(state: GameState, realmId: string): number {
  let n = 0;
  for (const c of Object.values(state.counties)) if (c.ownerId === realmId) n += 1;
  return n;
}

/**
 * Decide whether the game is over, from a single-player standpoint. Returns the
 * outcome (winner + reason) or null while play continues. Checked each turn.
 * The ONLY road to victory is total conquest — outlasting every rival until
 * none holds a county or fields an army:
 *  - extinction:   no realm survives
 *  - last-standing: exactly one realm survives (every challenger eliminated)
 *  - defeat:        the human player has been eliminated while rivals fight on
 */
export function evaluateOutcome(state: GameState): GameOutcome | null {
  const alive = Object.values(state.realms).filter((r) => !r.eliminated);
  if (alive.length === 0) return { winnerId: null, reason: 'extinction' };
  if (alive.length === 1) return { winnerId: alive[0].id, reason: 'last-standing' };

  const human = Object.values(state.realms).find((r) => r.isHuman);
  if (human && human.eliminated) {
    // The player's game ends; credit the strongest surviving rival.
    const leader = [...alive].sort((a, b) => countyCount(state, b.id) - countyCount(state, a.id))[0];
    return { winnerId: leader.id, reason: 'defeat' };
  }
  return null;
}
