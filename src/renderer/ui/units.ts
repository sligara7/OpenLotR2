/* Small helpers for showing army composition in the UI (display only). */

import { UNIT_TYPES } from '../../game/types/enums.ts';
import type { UnitType } from '../../game/types/enums.ts';
import type { Army } from '../../game/types/army.ts';
import { UNIT_SPEC } from '../../game/constants.ts';

/** Short labels for the troop types. */
export const UNIT_ABBR: Record<UnitType, string> = {
  Peasant: 'Pea',
  Maceman: 'Mac',
  Pikeman: 'Pik',
  Archer: 'Arc',
  Crossbowman: 'Xbow',
  Swordsman: 'Swd',
  Knight: 'Knt',
};

/** "Pea 26 · Arc 8 · Swd 8 · Knt 4" — only the types that are present. */
export function composition(army: Army): string {
  const parts = UNIT_TYPES.filter((t) => army.units[t] > 0).map((t) => `${UNIT_ABBR[t]} ${army.units[t]}`);
  return parts.length ? parts.join(' · ') : 'empty';
}

/** An army's movement allowance: the speed of its slowest present unit. */
export function armySpeed(army: Army): number {
  let slowest = Infinity;
  for (const t of UNIT_TYPES) if (army.units[t] > 0) slowest = Math.min(slowest, UNIT_SPEC[t].speed);
  return slowest === Infinity ? 0 : slowest;
}

/** "Swd 12 · Arc 5" for a realm's armory (weapons in stock), or "empty". */
export function armoryLine(weapons: Record<string, number>): string {
  const parts = UNIT_TYPES.filter((t) => (weapons[t] ?? 0) > 0).map((t) => `${UNIT_ABBR[t]} ${weapons[t]}`);
  return parts.length ? parts.join(' · ') : 'empty';
}

/** Unit types the player can cycle through when forging/mustering (no peasant
 *  weapon to forge; peasants are always musterable separately). */
export const FORGEABLE: UnitType[] = UNIT_TYPES.filter((t) => t !== 'Peasant');
