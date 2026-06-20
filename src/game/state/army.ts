/* Army construction & the unit-composition invariant (soldiers === Σ units). */

import { ARMY_MOVEMENT_POINTS, UNIT_SPEC } from '../constants.ts';
import { UNIT_TYPES, UnitType } from '../types/enums.ts';
import type { Army, UnitCounts } from '../types/army.ts';

/** Movement allowance of a composition: the speed of its SLOWEST present unit
 *  (combined arms keep pace with the baggage). Empty → the flat fallback. */
export function unitsSpeed(units: UnitCounts): number {
  let slowest = Infinity;
  for (const t of UNIT_TYPES) if (units[t] > 0) slowest = Math.min(slowest, UNIT_SPEC[t].speed);
  return slowest === Infinity ? ARMY_MOVEMENT_POINTS : slowest;
}

/** Movement points an army receives at the start of each turn. */
export function armyMovementAllowance(army: Army): number {
  return unitsSpeed(army.units);
}

/** A zeroed composition (every unit type present at 0). */
export function emptyUnits(): UnitCounts {
  const u = {} as UnitCounts;
  for (const t of UNIT_TYPES) u[t] = 0;
  return u;
}

/** Build a full composition from a partial one (missing types default to 0). */
export function unitsOf(partial: Partial<UnitCounts>): UnitCounts {
  const u = emptyUnits();
  for (const t of UNIT_TYPES) if (partial[t]) u[t] = partial[t]!;
  return u;
}

/** Total soldiers across a composition. */
export function unitsTotal(units: UnitCounts): number {
  let n = 0;
  for (const t of UNIT_TYPES) n += units[t];
  return n;
}

export interface ArmyInit {
  id: string;
  ownerId: string;
  col: number;
  row: number;
  countyId: string | null;
  /** Composition; or pass `soldiers` for a plain all-peasant levy. */
  units?: Partial<UnitCounts>;
  soldiers?: number;
}

/** Create an army, deriving the `soldiers` total from its composition. */
export function createArmy(init: ArmyInit): Army {
  const units = init.units ? unitsOf(init.units) : unitsOf({ [UnitType.Peasant]: init.soldiers ?? 0 });
  return {
    id: init.id,
    ownerId: init.ownerId,
    col: init.col,
    row: init.row,
    countyId: init.countyId,
    units,
    soldiers: unitsTotal(units),
    movement: unitsSpeed(units),
  };
}

/** Replace an army's composition and re-sync its soldier total (the one place
 *  combat/conquest should mutate troop counts, so the invariant always holds).
 *  Also caps remaining movement to the new allowance, so adding a slow unit
 *  (e.g. conscripting pikemen) drags the whole army down this turn too. */
export function setUnits(army: Army, units: UnitCounts): void {
  army.units = units;
  army.soldiers = unitsTotal(units);
  army.movement = Math.min(army.movement, unitsSpeed(units));
}
