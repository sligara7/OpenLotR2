/*
 * Sieges (Manual Part-6) — the only way to take a garrisoned castle.
 *
 * A siege is a multi-season investment. Each season, while the besieging army
 * holds the county:
 *   1. The garrison eats from the county's stores — but the besieger has already
 *      foraged them (this runs after foraging), so a stripped county STARVES the
 *      garrison. That is the starve-out tactic, straight out of the foraging
 *      system.
 *   2. Breach PROGRESS accrues, faster the larger the army is relative to the
 *      wall-backed garrison ("the bigger your army, the less time it will take").
 *   3. The walls take DAMAGE (which persists between sieges until repaired).
 * The siege resolves when the garrison is starved/battered to nothing (a
 * surrender) or progress reaches a breach (an assault, resolved as a battle with
 * the defenders fighting at a wall-strength multiplier). Winning flips the
 * county to the attacker; a repulsed assault resets the breach progress.
 *
 * The besieging army maintains the siege by STAYING: if it is destroyed or
 * marches off (army.countyId no longer the besieged county), the siege lifts.
 */

import {
  ARMY_FORAGE_PORTIONS_PER_SOLDIER,
  ARMY_STARVE_FRACTION,
  CASTLE_SPEC,
  SIEGE,
} from '../constants.ts';
import { resolveBattle, garrisonComposition } from './combat.ts';
import { setUnits } from '../state/army.ts';
import { captureCounty } from './conquest.ts';
import { drawFood } from './foraging.ts';
import type { GameState } from '../types/realm.ts';
import type { County } from '../types/county.ts';
import type { Rng } from '../rng.ts';

export type SiegeStatus = 'ongoing' | 'stormed' | 'starved' | 'repulsed' | 'lifted';

export interface SiegeOutcome {
  countyId: string;
  attackerRealmId: string;
  besiegerArmyId: string;
  progress: number;
  seasons: number;
  /** Garrison soldiers left at season's end. */
  garrison: number;
  /** Garrison soldiers lost to starvation this season. */
  garrisonStarved: number;
  status: SiegeStatus;
  /** True if the county changed hands this season. */
  captured: boolean;
}

export interface SiegeLedger {
  sieges: SiegeOutcome[];
}

/** Wall-backed fighting strength of a castle's defenders (damage weakens it). */
export function garrisonStrength(county: County): number {
  const mult = CASTLE_SPEC[county.castle.type].defenseMultiplier;
  const intact = 1 - county.castle.damage * 0.5; // battered walls defend worse
  return county.castle.garrison * mult * intact;
}

/** Starve the garrison on whatever food the besieger left behind this season. */
function starveGarrison(county: County): number {
  const need = county.castle.garrison * ARMY_FORAGE_PORTIONS_PER_SOLDIER;
  if (need <= 0) return 0;
  const fed = drawFood(county, need);
  const shortfall = need - fed;
  if (shortfall <= 1e-9) return 0;
  const unfed = shortfall / ARMY_FORAGE_PORTIONS_PER_SOLDIER;
  const starved = Math.min(county.castle.garrison, Math.ceil(unfed * ARMY_STARVE_FRACTION));
  county.castle.garrison -= starved;
  return starved;
}

/**
 * Advance every active siege one season. Run as a world step AFTER foraging, so
 * the besieger has already drawn down the county the garrison depends on.
 * Mutates state (garrison, castle damage, army soldiers, ownership) and clears
 * sieges that resolve or lift.
 */
export function advanceSieges(state: GameState, rng: Rng): SiegeLedger {
  const sieges: SiegeOutcome[] = [];

  for (const siege of Object.values(state.sieges)) {
    const county = state.counties[siege.countyId];
    const army = state.armies[siege.besiegerArmyId];

    // The siege lifts if the besieger is gone or has marched off the county, or
    // the county is somehow already the attacker's.
    const stillHeld = army && army.countyId === siege.countyId && county
      && county.ownerId !== siege.attackerRealmId;
    if (!stillHeld) {
      delete state.sieges[siege.countyId];
      if (county) {
        sieges.push({
          countyId: siege.countyId, attackerRealmId: siege.attackerRealmId,
          besiegerArmyId: siege.besiegerArmyId, progress: siege.progress, seasons: siege.seasons,
          garrison: county.castle.garrison, garrisonStarved: 0, status: 'lifted', captured: false,
        });
      }
      continue;
    }

    siege.seasons += 1;

    // 1. Starve the garrison on the stripped county.
    const garrisonStarved = starveGarrison(county);

    // 2. Batter the walls — progress scales with army : defence size ratio.
    const defence = Math.max(1, garrisonStrength(county));
    const rate = Math.min(SIEGE.maxProgressPerSeason, SIEGE.baseProgressPerSeason * (army.soldiers / defence));
    siege.progress = Math.min(1, siege.progress + rate);
    county.castle.damage = Math.min(1, county.castle.damage + SIEGE.damagePerSeason);

    let status: SiegeStatus = 'ongoing';
    let captured = false;

    if (county.castle.garrison <= 0) {
      // Starved or battered into surrender.
      captureCounty(state, siege.countyId, siege.attackerRealmId);
      status = 'starved';
      captured = true;
    } else if (siege.progress >= 1) {
      // Breach! Storm the walls: the garrison (archers/crossbows behind walls)
      // fights at the castle's wall multiplier.
      const result = resolveBattle(
        { units: army.units },
        {
          units: garrisonComposition(county.castle.garrison),
          modifier: garrisonStrength(county) / county.castle.garrison,
        },
        rng,
      );
      setUnits(army, result.attacker.unitsAfter);
      county.castle.garrison = result.defender.survivors;

      if (result.defenderDestroyed) {
        captureCounty(state, siege.countyId, siege.attackerRealmId);
        status = 'stormed';
        captured = true;
      } else {
        // Assault thrown back — the breach is held; rebuild and try again.
        siege.progress = 0;
        status = 'repulsed';
        if (army.soldiers <= 0) { delete state.armies[army.id]; delete state.sieges[siege.countyId]; }
      }
    }

    sieges.push({
      countyId: siege.countyId, attackerRealmId: siege.attackerRealmId,
      besiegerArmyId: siege.besiegerArmyId, progress: siege.progress, seasons: siege.seasons,
      garrison: county.castle.garrison, garrisonStarved, status, captured,
    });
  }

  return { sieges };
}
