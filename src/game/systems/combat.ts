/*
 * Combat resolution — auto-calculated field battles (Manual Part-5 "Battles").
 *
 * The manual gives no battle math (declining a battle hands it to the computer
 * to "calculate automatically"), so this is a tunable strength model:
 *   - Each side's POWER = soldiers x posture/terrain modifier x a random swing.
 *   - CASUALTIES each side suffers scale with the ENEMY's share of total power
 *     (an even fight bloodies both; a lopsided one annihilates the weaker).
 *   - The side with more survivors holds the field; a side reduced to zero is
 *     destroyed.
 *
 * It is pure: no map or state access, just numbers in → a BattleResult out, so
 * it is trivial to test and reuse for both field battles and siege assaults.
 * Unit types (archers/knights and their matchups) will later feed richer power.
 */

import { COMBAT } from '../constants.ts';
import type { Rng } from '../rng.ts';

export interface Combatant {
  /** Soldiers brought to the fight. */
  soldiers: number;
  /** Multiplier on raw power (terrain, castle walls, posture). Default 1. */
  modifier?: number;
}

export interface BattleResult {
  attackerSurvivors: number;
  defenderSurvivors: number;
  attackerCasualties: number;
  defenderCasualties: number;
  /** 'attacker' | 'defender' — whoever holds the field (more survivors). */
  winner: 'attacker' | 'defender';
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
}

/** Resolve one battle. Deterministic given the same soldiers, modifiers & RNG. */
export function resolveBattle(attacker: Combatant, defender: Combatant, rng: Rng): BattleResult {
  const swing = (): number => rng.range(1 - COMBAT.powerVariance, 1 + COMBAT.powerVariance);
  const aPower = Math.max(0, attacker.soldiers) * (attacker.modifier ?? 1) * swing();
  const dPower = Math.max(0, defender.soldiers) * (defender.modifier ?? 1) * swing();
  const total = aPower + dPower;

  // No power on either side → a non-battle; nobody dies, defender "holds".
  if (total <= 0) {
    return {
      attackerSurvivors: attacker.soldiers,
      defenderSurvivors: defender.soldiers,
      attackerCasualties: 0,
      defenderCasualties: 0,
      winner: 'defender',
      attackerDestroyed: false,
      defenderDestroyed: false,
    };
  }

  // Each side loses a fraction equal to the enemy's share of power, amplified by
  // lethality and clamped so it can wipe a side out but never go negative.
  const aLossFrac = Math.min(1, (dPower / total) * COMBAT.lethality);
  const dLossFrac = Math.min(1, (aPower / total) * COMBAT.lethality);

  const attackerCasualties = Math.min(attacker.soldiers, Math.round(attacker.soldiers * aLossFrac));
  const defenderCasualties = Math.min(defender.soldiers, Math.round(defender.soldiers * dLossFrac));

  const attackerSurvivors = attacker.soldiers - attackerCasualties;
  const defenderSurvivors = defender.soldiers - defenderCasualties;

  // The field goes to whoever has more left; ties (rare, RNG-broken) to the
  // defender, who held the ground.
  const winner: 'attacker' | 'defender' = attackerSurvivors > defenderSurvivors ? 'attacker' : 'defender';

  return {
    attackerSurvivors,
    defenderSurvivors,
    attackerCasualties,
    defenderCasualties,
    winner,
    attackerDestroyed: attackerSurvivors <= 0,
    defenderDestroyed: defenderSurvivors <= 0,
  };
}
