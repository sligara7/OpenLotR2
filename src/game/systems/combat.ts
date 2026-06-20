/*
 * Combat resolution — auto-calculated combined-arms battles (Manual Part-5).
 *
 * Each army is a COMPOSITION of unit types. A side's power is the sum, over its
 * units, of attack × a matchup multiplier against the enemy's mix (so archers
 * shred a peasant horde but glance off knights, crossbows punch through plate,
 * etc. — the rock-paper-scissors from UNIT_MATCHUP). Casualties scale with the
 * enemy's share of total power, then are distributed across the loser's units by
 * vulnerability (low defence + countered by the enemy mix → dies first). The
 * side with more survivors holds the field.
 *
 * Pure: numbers in → a BattleResult out (no map/state). Still strength-driven
 * and seeded-deterministic, but now composition decides who wins — the point of
 * fielding the right troops.
 */

import { COMBAT, UNIT_MATCHUP, UNIT_NEUTRAL_MATCHUP, UNIT_SPEC } from '../constants.ts';
import { UNIT_TYPES } from '../types/enums.ts';
import type { UnitType } from '../types/enums.ts';
import type { UnitCounts } from '../types/army.ts';
import { emptyUnits, unitsTotal } from '../state/army.ts';
import type { Rng } from '../rng.ts';

export interface Force {
  units: UnitCounts;
  /** Multiplier on raw power (terrain, castle walls, posture). Default 1. */
  modifier?: number;
}

export interface SideResult {
  unitsBefore: UnitCounts;
  unitsAfter: UnitCounts;
  survivors: number;
  casualties: number;
}

export interface BattleResult {
  attacker: SideResult;
  defender: SideResult;
  /** 'attacker' | 'defender' — whoever holds the field (more survivors). */
  winner: 'attacker' | 'defender';
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
}

const matchup = (a: UnitType, d: UnitType): number => UNIT_MATCHUP[a]?.[d] ?? UNIT_NEUTRAL_MATCHUP;

/** Average matchup multiplier of one attacking unit type against an enemy mix. */
function avgMatchup(attacker: UnitType, enemy: UnitCounts, enemyTotal: number): number {
  if (enemyTotal <= 0) return UNIT_NEUTRAL_MATCHUP;
  let acc = 0;
  for (const e of UNIT_TYPES) if (enemy[e]) acc += (enemy[e] / enemyTotal) * matchup(attacker, e);
  return acc;
}

/** A side's offensive power against a given enemy composition. */
function sidePower(own: UnitCounts, enemy: UnitCounts, enemyTotal: number): number {
  let p = 0;
  for (const u of UNIT_TYPES) {
    if (!own[u]) continue;
    p += own[u] * UNIT_SPEC[u].attack * avgMatchup(u, enemy, enemyTotal);
  }
  return p;
}

/**
 * Spread `casualties` across a side's units by vulnerability (each type's losses
 * ∝ count × enemyDamageMultiplier / defence), using largest-remainder rounding so
 * the totals match exactly and never exceed the available count.
 */
function distributeCasualties(units: UnitCounts, casualties: number, enemy: UnitCounts, enemyTotal: number): UnitCounts {
  const after = { ...units };
  if (casualties <= 0) return after;

  const weight: Record<string, number> = {};
  let totalWeight = 0;
  for (const u of UNIT_TYPES) {
    if (!units[u]) { weight[u] = 0; continue; }
    // How hard the enemy mix hits unit u (their matchup against this type).
    let hit = UNIT_NEUTRAL_MATCHUP;
    if (enemyTotal > 0) {
      hit = 0;
      for (const e of UNIT_TYPES) if (enemy[e]) hit += (enemy[e] / enemyTotal) * matchup(e, u);
    }
    const w = (units[u] * Math.max(0.05, hit)) / UNIT_SPEC[u].defence;
    weight[u] = w;
    totalWeight += w;
  }
  if (totalWeight <= 0) return after;

  // Largest-remainder allocation, capped at each type's count.
  const exact: { u: UnitType; whole: number; frac: number }[] = [];
  let assigned = 0;
  for (const u of UNIT_TYPES) {
    const want = casualties * (weight[u] / totalWeight);
    const whole = Math.min(units[u], Math.floor(want));
    exact.push({ u, whole, frac: want - Math.floor(want) });
    assigned += whole;
  }
  let remainder = casualties - assigned;
  // Hand out the remaining losses to the highest fractional parts that still
  // have room.
  exact.sort((a, b) => b.frac - a.frac);
  for (const slot of exact) {
    if (remainder <= 0) break;
    if (slot.whole < units[slot.u]) { slot.whole += 1; remainder -= 1; }
  }
  // If rounding/caps left some unassigned, dump onto any type with room.
  for (const slot of exact) {
    if (remainder <= 0) break;
    while (slot.whole < units[slot.u] && remainder > 0) { slot.whole += 1; remainder -= 1; }
  }
  for (const slot of exact) after[slot.u] = units[slot.u] - slot.whole;
  return after;
}

const side = (before: UnitCounts, after: UnitCounts): SideResult => ({
  unitsBefore: before,
  unitsAfter: after,
  survivors: unitsTotal(after),
  casualties: unitsTotal(before) - unitsTotal(after),
});

/** Resolve one battle. Deterministic given the same compositions & RNG. */
export function resolveBattle(attacker: Force, defender: Force, rng: Rng): BattleResult {
  const aUnits = attacker.units;
  const dUnits = defender.units;
  const aTotal = unitsTotal(aUnits);
  const dTotal = unitsTotal(dUnits);

  const swing = (): number => rng.range(1 - COMBAT.powerVariance, 1 + COMBAT.powerVariance);
  const aPower = sidePower(aUnits, dUnits, dTotal) * (attacker.modifier ?? 1) * swing();
  const dPower = sidePower(dUnits, aUnits, aTotal) * (defender.modifier ?? 1) * swing();
  const total = aPower + dPower;

  if (total <= 0) {
    return {
      attacker: side(aUnits, { ...aUnits }),
      defender: side(dUnits, { ...dUnits }),
      winner: 'defender',
      attackerDestroyed: aTotal <= 0,
      defenderDestroyed: dTotal <= 0,
    };
  }

  const aCas = Math.min(aTotal, Math.round(aTotal * Math.min(1, (dPower / total) * COMBAT.lethality)));
  const dCas = Math.min(dTotal, Math.round(dTotal * Math.min(1, (aPower / total) * COMBAT.lethality)));

  const aAfter = distributeCasualties(aUnits, aCas, dUnits, dTotal);
  const dAfter = distributeCasualties(dUnits, dCas, aUnits, aTotal);

  const attackerSide = side(aUnits, aAfter);
  const defenderSide = side(dUnits, dAfter);

  return {
    attacker: attackerSide,
    defender: defenderSide,
    winner: attackerSide.survivors > defenderSide.survivors ? 'attacker' : 'defender',
    attackerDestroyed: attackerSide.survivors <= 0,
    defenderDestroyed: defenderSide.survivors <= 0,
  };
}

/** A reasonable garrison composition for a castle of `n` defenders: the manual's
 *  recommended archers/crossbowmen behind the walls, stiffened with swordsmen
 *  and pikes. Used when resolving a siege assault. */
export function garrisonComposition(n: number): UnitCounts {
  const u = emptyUnits();
  if (n <= 0) return u;
  u.Crossbowman = Math.round(n * 0.3);
  u.Archer = Math.round(n * 0.2);
  u.Pikeman = Math.round(n * 0.2);
  u.Swordsman = n - u.Crossbowman - u.Archer - u.Pikeman; // remainder
  return u;
}
