/*
 * Conquest — a county changing hands, and realms falling out of the game.
 *
 * Shared by both routes to ownership: occupying an undefended county town
 * (commands/handlers/army.ts) and winning a siege (systems/siege.ts). Kept in
 * one place so the side effects of a capture — resentful populace, lifted siege,
 * possible elimination of the loser — stay consistent however the county falls.
 */

import {
  CAPITULATION,
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

/** Soldiers a realm still has in the field, across every army it owns. */
function fieldStrength(state: GameState, realmId: string): number {
  let n = 0;
  for (const a of Object.values(state.armies)) if (a.ownerId === realmId) n += a.soldiers;
  return n;
}

export interface CapitulationEntry {
  /** The realm that sued for terms. */
  realmId: string;
  /** Who took its remaining lands. */
  toRealmId: string;
  /** Counties handed over. */
  counties: string[];
}

export type CapitulationLedger = CapitulationEntry[];

/**
 * A beaten realm sues for terms rather than being hunted to the last acre.
 *
 * Conquests ended politically far more often than they ended in annihilation —
 * realms surrendered, defected, or were partitioned. Requiring every rival to be
 * ground to zero county by county asks for the rarest outcome in history, and it
 * is why twenty games produced thirty-four won sieges and not one elimination.
 *
 * A realm capitulates when it is no longer a going concern: down to
 * CAPITULATION.countyFloor counties or fewer AND with less than a single legal
 * army's worth of men left in the field. Both halves matter — a small realm with
 * an army intact is still dangerous and fights on, and a large realm that has
 * lost its army still has the ground to raise another.
 *
 * ITS LANDS GO TO WHOEVER PRESSED IT HARDEST, measured as the rival holding the
 * most counties bordering what it has left; ties break on total holdings, then
 * on realm id, so the outcome is deterministic and replayable from a seed. Its
 * remaining armies lay down their arms with it.
 *
 * THE HUMAN PLAYER NEVER CAPITULATES AUTOMATICALLY. Surrender is a decision, and
 * taking it out of the player's hands would end their game on the engine's
 * judgement rather than their own — they lose when they hold nothing, as before.
 */
export function updateCapitulations(state: GameState): CapitulationLedger {
  const ledger: CapitulationLedger = [];

  const alive = Object.values(state.realms)
    .filter((r) => !r.eliminated)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // A surrender needs somebody to surrender TO. Beyond that there is no floor:
  // the two-realm endgame is exactly where this matters most, because that is
  // the stalemate the harness kept measuring.
  if (alive.length < 2) return ledger;

  for (const realm of alive) {
    if (realm.isHuman || realm.eliminated) continue;

    const held = Object.values(state.counties).filter((c) => c.ownerId === realm.id);
    if (held.length === 0) continue;
    if (!isBeaten(state, realm.id, held.length)) continue;

    const victor = pressedHardest(state, realm.id, held);
    if (!victor) continue;

    const counties = held.map((c) => c.id).sort();
    for (const id of counties) captureCounty(state, id, victor);
    for (const army of Object.values(state.armies)) {
      if (army.ownerId === realm.id) delete state.armies[army.id];
    }

    ledger.push({ realmId: realm.id, toRealmId: victor, counties });
  }

  return ledger;
}

/**
 * Is this realm beaten — not merely losing?
 *
 * Two ways, and both are deliberately hard to reach. Either it is down to a
 * couple of counties with no army worth the name, in which case hunting it acre
 * by acre decides nothing anybody doesn't already know. Or a rival has become so
 * dominant in BOTH land and men that the question is settled: that is how most
 * conquests actually ended, with magnates and princes reading the arithmetic and
 * submitting while they still held ground.
 *
 * The share floor is what stops an even contest being conceded. Two realms at
 * forty and thirty counties are fighting a war, not finishing one, and neither
 * should ever fold on ratios alone.
 */
function isBeaten(state: GameState, realmId: string, held: number): boolean {
  const total = Object.keys(state.counties).length;
  if (total === 0) return false;

  // The share floor guards BOTH routes, not just the ratio one. A realm holding
  // a real piece of the map is a going concern however few counties that is —
  // on a small map two counties can be half of everything, and calling that
  // beaten would concede an even contest on a technicality.
  if (held / total >= CAPITULATION.hopelessShare) return false;

  const mine = fieldStrength(state, realmId);
  if (held <= CAPITULATION.countyFloor && mine < CAPITULATION.soldierFloor) return true;

  for (const rival of Object.values(state.realms)) {
    if (rival.eliminated || rival.id === realmId) continue;
    const land = countyCount(state, rival.id);
    const men = fieldStrength(state, rival.id);
    // `men > 0` matters: without it, two realms with no armies at all satisfy
    // `0 >= 0 * ratio` and the weaker one surrenders to a rival that cannot
    // actually threaten it.
    if (men > 0
        && land >= held * CAPITULATION.dominanceRatio
        && men >= mine * CAPITULATION.dominanceRatio) {
      return true;
    }
  }
  return false;
}

/**
 * Which surviving rival has pressed this realm hardest — the one holding the
 * most counties adjacent to what it still has. Falls back to the largest realm
 * when nothing borders it at all (an island holdout), and breaks every tie on
 * realm id so the same game always ends the same way.
 */
function pressedHardest(state: GameState, realmId: string, held: County[]): string | null {
  const pressure = new Map<string, number>();
  for (const county of held) {
    for (const id of state.adjacency[county.id] ?? []) {
      const owner = state.counties[id]?.ownerId;
      if (!owner || owner === realmId) continue;
      if (state.realms[owner]?.eliminated) continue;
      pressure.set(owner, (pressure.get(owner) ?? 0) + 1);
    }
  }

  const rivals = Object.values(state.realms)
    .filter((r) => !r.eliminated && r.id !== realmId)
    .map((r) => ({
      id: r.id,
      pressing: pressure.get(r.id) ?? 0,
      size: countyCount(state, r.id),
    }))
    .sort((a, b) =>
      b.pressing - a.pressing || b.size - a.size || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const best = rivals[0];
  return best && best.size > 0 ? best.id : null;
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
