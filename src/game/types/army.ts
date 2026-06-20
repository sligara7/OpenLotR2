/* Army — a body of soldiers positioned on a map tile. */

import type { UnitType } from './enums.ts';

/** Soldier head-count by unit type. The composition is the source of truth for
 *  combat (matchups); `Army.soldiers` is its denormalised total. */
export type UnitCounts = Record<UnitType, number>;

export interface Army {
  id: string;
  /** Realm that controls this army. */
  ownerId: string;
  /** Tile position (odd-r offset coords). */
  col: number;
  row: number;
  /** County the army currently occupies (the tile's owner), or null over sea.
   *  Denormalised from the map so the engine can forage without a map import. */
  countyId: string | null;
  /** Composition by unit type — drives combined-arms battle resolution. */
  units: UnitCounts;
  /** Total soldiers. INVARIANT: equals the sum of `units` (kept in sync by the
   *  state/army helpers); systems that only need the size read this. */
  soldiers: number;
  /** Movement points left this turn; spent marching, reset each season. */
  movement: number;
  /** True if this army is (or contains) hired mercenaries: self-armed, higher
   *  wages, and it cannot be combined with another mercenary army. */
  mercenary: boolean;
}
