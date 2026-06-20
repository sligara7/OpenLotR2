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
  /** Hired mercenaries (self-armed, costly). Defaults to a citizen army. */
  mercenary?: boolean;
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
    mercenary: init.mercenary ?? false,
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

/** Remove `n` soldiers from an army, spread proportionally across its unit types
 *  (largest-remainder so the total is exact and no type goes negative). Used for
 *  desertion. */
export function removeSoldiers(army: Army, n: number): void {
  const total = army.soldiers;
  if (n <= 0 || total <= 0) return;
  if (n >= total) { setUnits(army, emptyUnits()); return; }

  const cut: Record<string, number> = {};
  const frac: { t: UnitType; f: number }[] = [];
  let assigned = 0;
  for (const t of UNIT_TYPES) {
    const want = (army.units[t] * n) / total;
    const whole = Math.min(army.units[t], Math.floor(want));
    cut[t] = whole;
    assigned += whole;
    frac.push({ t, f: want - Math.floor(want) });
  }
  let rem = n - assigned;
  frac.sort((a, b) => b.f - a.f);
  for (const { t } of frac) { if (rem <= 0) break; if (cut[t] < army.units[t]) { cut[t] += 1; rem -= 1; } }

  const next = { ...army.units };
  for (const t of UNIT_TYPES) next[t] -= cut[t];
  setUnits(army, next);
}

/** An unused army id for a realm (its first army keeps the bare `${realm}-army`). */
export function freeArmyId(armies: Record<string, { id: string }>, realmId: string): string {
  let id = `${realmId}-army`;
  let n = 1;
  while (armies[id]) { n += 1; id = `${realmId}-army-${n}`; }
  return id;
}
