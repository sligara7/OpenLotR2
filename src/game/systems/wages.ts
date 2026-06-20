/*
 * Army upkeep (Manual Part-4: "unpaid soldiers desert").
 *
 * Each turn every realm owes wages for the soldiers it keeps under arms. Wages
 * are drawn from the shared treasury after taxes are collected. If a realm can't
 * pay in full, the UNPAID share of its forces bleeds deserters — proportionally
 * across every army — so a ruler can't field more troops than the economy
 * sustains. An army deserted to nothing is disbanded.
 */

import { DESERTION_FRACTION, MERCENARY_WAGE_MULTIPLIER, WAGE_PER_SOLDIER } from '../constants.ts';
import { removeSoldiers } from '../state/army.ts';
import type { GameState } from '../types/realm.ts';
import type { Army } from '../types/army.ts';

/** Seasonal wage bill for one army (mercenaries cost far more). */
function armyWage(army: Army): number {
  return army.soldiers * WAGE_PER_SOLDIER * (army.mercenary ? MERCENARY_WAGE_MULTIPLIER : 1);
}

export interface RealmWages {
  realmId: string;
  /** Wages owed this turn. */
  due: number;
  /** Wages actually paid (capped by the treasury). */
  paid: number;
  /** Soldiers lost to desertion when the purse fell short. */
  deserted: number;
}

export interface WagesLedger {
  realms: RealmWages[];
}

/** Pay every realm's army wages; short purses lose deserters. Mutates state. */
export function payWages(state: GameState): WagesLedger {
  const realms: RealmWages[] = [];

  for (const realm of Object.values(state.realms)) {
    const armies = Object.values(state.armies).filter((a) => a.ownerId === realm.id);
    const due = armies.reduce((s, a) => s + armyWage(a), 0);
    if (due <= 0) continue;

    const purse = realm.treasury.gold;
    let deserted = 0;

    if (purse >= due) {
      realm.treasury.gold -= due;
    } else {
      realm.treasury.gold = 0;
      const unpaidFrac = (due - purse) / due; // 0..1
      for (const army of armies) {
        // Round UP so an unpaid army always loses someone (and shrinks to nothing
        // over time), as with foraging starvation.
        const leave = Math.ceil(army.soldiers * unpaidFrac * DESERTION_FRACTION);
        if (leave > 0) { removeSoldiers(army, leave); deserted += leave; }
        if (army.soldiers <= 0) delete state.armies[army.id];
      }
    }

    realms.push({ realmId: realm.id, due, paid: Math.min(due, purse), deserted });
  }

  return { realms };
}
