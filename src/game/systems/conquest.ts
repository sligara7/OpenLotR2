/*
 * Conquest — a county changing hands, and realms falling out of the game.
 *
 * Shared by both routes to ownership: occupying an undefended county town
 * (commands/handlers/army.ts) and winning a siege (systems/siege.ts). Kept in
 * one place so the side effects of a capture — resentful populace, lifted siege,
 * possible elimination of the loser — stay consistent however the county falls.
 */

import {
  CASTLE_SPEC,
  CONQUEST,
  GARRISON_ON_CAPTURE,
  MIN_ARMY_SIZE,
  WATCH_ON_CAPTURE,
} from '../constants.ts';
import { UnitType } from '../types/enums.ts';
import { setUnits } from '../state/army.ts';
import type { County } from '../types/county.ts';
import type { GameState, GameOutcome } from '../types/realm.ts';

/**
 * Transfer a county to a new owner. The defeated garrison is gone, the conquered
 * populace turns resentful, and any siege on the county lifts. Castle type and
 * damage persist — you capture the walls, cracks and all.
 *
 * IF AN ARMY TOOK IT, THAT ARMY LEAVES MEN BEHIND. This is what a medieval
 * captain actually did, and mechanically it is what makes conquest stick: a
 * county walked into and left empty is one the enemy walks back into next
 * season. Twenty AI-versus-AI games measured that revolving door as the reason
 * no game ever reached a decision, so holding land now costs an army strength
 * and a thin raiding force must choose between taking counties and keeping them.
 *
 * An army too small to spare anyone takes the county but cannot hold it, which
 * is a real and deliberate choice rather than a failure.
 */
export function captureCounty(
  state: GameState,
  countyId: string,
  newOwnerId: string,
  byArmyId?: string,
): void {
  const county = state.counties[countyId];
  if (!county) return;

  county.ownerId = newOwnerId;
  county.castle.garrison = 0;
  if (byArmyId) garrisonFromArmy(state, county, byArmyId);
  county.happiness = Math.min(county.happiness, CONQUEST.conqueredHappiness);
  county.revolting = false;
  county.unrestSeasons = 0;
  // Occupy: held under the garrison's order for a few seasons, so a brief
  // post-conquest dip can't immediately flip the county back to neutral.
  county.pacifiedSeasons = CONQUEST.pacifySeasons;

  delete state.sieges[countyId];
}

/**
 * Detach a holding force from the army that just took this county.
 *
 * How many depends on what there is to hold: a castle wants a real garrison,
 * a bare county only a watch on the town. The army keeps at least the minimum
 * legal size, so it is never dissolved by garrisoning — if it cannot spare the
 * men, nobody stays and the county is held by presence alone.
 */
function garrisonFromArmy(state: GameState, county: County, armyId: string): void {
  const army = state.armies[armyId];
  if (!army) return;

  const walls = CASTLE_SPEC[county.castle.type].garrison;
  const wanted = walls > 0 ? Math.round(walls * GARRISON_ON_CAPTURE) : WATCH_ON_CAPTURE;
  const sparable = army.soldiers - MIN_ARMY_SIZE;
  const left = Math.min(wanted, sparable);
  if (left <= 0) return;

  // Take the garrison from the army's own ranks, cheapest troops first: a
  // captain leaves levies to watch a gate and keeps his knights for the field.
  const remaining = { ...army.units };
  let owed = left;
  for (const type of GARRISON_ORDER) {
    if (owed <= 0) break;
    const take = Math.min(remaining[type], owed);
    remaining[type] -= take;
    owed -= take;
  }
  setUnits(army, remaining);
  county.castle.garrison = left - owed;
}

/** Whom a captain leaves behind, first to last: the cheapest troops he has. */
const GARRISON_ORDER: readonly UnitType[] = [
  UnitType.Peasant, UnitType.Pikeman, UnitType.Maceman, UnitType.Archer,
  UnitType.Crossbowman, UnitType.Swordsman, UnitType.Knight,
];

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
