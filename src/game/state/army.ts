/* Army construction & the unit-composition invariant (soldiers === Σ units). */

import { UNIT_TYPES, UnitType } from '../types/enums.ts';
import type { Army, UnitCounts } from '../types/army.ts';

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
  };
}

/** Replace an army's composition and re-sync its soldier total (the one place
 *  combat/conquest should mutate troop counts, so the invariant always holds). */
export function setUnits(army: Army, units: UnitCounts): void {
  army.units = units;
  army.soldiers = unitsTotal(units);
}
