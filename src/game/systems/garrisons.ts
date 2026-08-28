/*
 * Settled ground gives its soldiers back.
 *
 * Taking a county detaches a garrison from the army that took it
 * (systems/conquest.ts). That fixed an earlier stall — a county walked into and
 * left empty is one the enemy walks back into — and created the opposite one:
 * nothing anywhere ever returned those men, so `castle.garrison` was written at
 * capture and from then on only shrank. A conqueror's field strength fell with
 * every county he won, and twenty AI-versus-AI games ended 0-for-20 decided with
 * the leader frozen at half the map. That is the Crusader-state failure — every
 * castle held is men not in the field — and Napoleon's two hundred thousand tied
 * down holding Spain is the same arithmetic drawn larger.
 *
 * ⚠️ THE FIRST ATTEMPT AT THIS FIX WENT THE WRONG WAY, and the harness said so
 * within one run: letting settled counties RAISE their own levies up to their
 * walls' full establishment strengthened defenders exactly as much as it helped
 * conquerors. Measured over one seeded game, garrisons went from 301 men to
 * 5,537 while field armies stayed at three to five hundred, assaults repulsed
 * tripled, and the map froze harder than before. Every county became a fortress
 * and nobody could compound. The mechanism is recorded here because the wrong
 * version is a very plausible reading of the right idea.
 *
 * What the conquerors who actually finished had was conquest financing the next
 * conquest — Rome's socii and then citizenship turning conquered manpower into
 * ROMAN manpower, the Ottoman timar granting conquered land out in exchange for
 * the cavalry that took the next land. The gain is in the FIELD, not on the
 * walls. And no one garrisons the interior: you hold the frontier, and the
 * settled shires behind it keep a watch on the town and nothing more.
 *
 * So: a county that has accepted its lord releases its surplus garrison back
 * into the war. Men rejoin an army standing in the county if there is one, and
 * otherwise go home to the population that raised them, where they can be
 * conscripted again. A freshly taken, sullen, or besieged county keeps every man
 * it has — which is what keeps the frontier expensive and the conquest real.
 *
 * Deterministic: a pass over counties in map order, no randomness.
 */

import { GARRISON, WATCH_ON_CAPTURE } from '../constants.ts';
import { UnitType } from '../types/enums.ts';
import { setUnits } from '../state/army.ts';
import type { County } from '../types/county.ts';
import type { GameState } from '../types/realm.ts';

export interface GarrisonEntry {
  countyId: string;
  /** Men stood down from the walls this season. */
  released: number;
  /** Garrison after the release. */
  garrison: number;
  /** The army they joined, or null if they went home to the county. */
  toArmyId: string | null;
}

export type GarrisonLedger = GarrisonEntry[];

/**
 * The garrison a settled county keeps: a watch on the town. Deliberately not
 * the castle's full establishment — manning walls to their designed strength is
 * a wartime act a lord pays for, not something a quiet shire does by itself.
 */
export function watchStrength(_county: County): number {
  return WATCH_ON_CAPTURE;
}

/**
 * Stand down surplus garrisons in settled counties, returning the men to the
 * war. Runs each season after the fighting, so a county under threat this turn
 * keeps its walls manned through it.
 *
 * A county stands men down only when all of the following hold: it has an owner,
 * it is not in revolt, occupation has worn off, no siege stands over it, and its
 * happiness has reached GARRISON.settledHappiness. The last is load-bearing — a
 * county that resents its lord is not settled, however long he has held it, so a
 * conquest driven by taxes and hunger goes on costing him the men who hold it.
 */
export function settleGarrisons(state: GameState): GarrisonLedger {
  const ledger: GarrisonLedger = [];

  for (const county of Object.values(state.counties)) {
    if (!county.ownerId || county.revolting) continue;
    if (county.pacifiedSeasons > 0) continue;
    if (state.sieges[county.id]) continue;
    if (county.happiness < GARRISON.settledHappiness) continue;

    const surplus = county.castle.garrison - watchStrength(county);
    if (surplus <= 0) continue;

    const released = Math.min(GARRISON.releasePerSeason, surplus);
    county.castle.garrison -= released;

    // Rejoin an army standing here if its owner still holds the county —
    // otherwise the men go home, where conscription can call them up again.
    const army = Object.values(state.armies)
      .filter((a) => a.countyId === county.id && a.ownerId === county.ownerId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];

    if (army) {
      setUnits(army, { ...army.units, [UnitType.Peasant]: army.units[UnitType.Peasant] + released });
      ledger.push({ countyId: county.id, released, garrison: county.castle.garrison, toArmyId: army.id });
    } else {
      county.population += released;
      ledger.push({ countyId: county.id, released, garrison: county.castle.garrison, toArmyId: null });
    }
  }

  return ledger;
}
