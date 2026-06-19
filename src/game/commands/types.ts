/*
 * Command protocol — the serialisable boundary between client and server.
 *
 * A Command is a player *intent* (plain JSON: a `type` discriminant + fields).
 * The client sends commands; the server validates them against the
 * authoritative GameState (ownership + rules) and applies them. `EndTurn`
 * advances the world via the engine. Keeping intents as data (never function
 * calls) is what makes the split — and eventual online play — possible.
 *
 * FUTURE COMMANDS (need systems that don't exist yet): merchant Buy/Sell,
 * Conscript/DisbandArmy, MoveArmy, LaySiege. Add them to this union and a
 * handler under ./handlers.
 */

import type { CastleType, FieldStatus, RationLevel } from '../types/enums.ts';
import type { Rng } from '../rng.ts';
import type { TurnReport } from '../engine.ts';

export interface SetTaxRate { type: 'SetTaxRate'; countyId: string; rate: number; }
export interface SetRation { type: 'SetRation'; countyId: string; level: RationLevel; }
export interface SetLabourPolicy {
  type: 'SetLabourPolicy';
  countyId: string;
  industryShare?: number;
  grainBeefBalance?: number;
}
/** Assign a field to a usable purpose. `use` is restricted to the statuses a
 *  player may set directly (Fallow/Grain/Cattle); damaged/barren fields must
 *  recover or be reclaimed first (reclamation is automatic when labour allows). */
export interface AssignField {
  type: 'AssignField';
  countyId: string;
  fieldIndex: number;
  use: typeof FieldStatus.Fallow | typeof FieldStatus.Grain | typeof FieldStatus.Cattle;
}
export interface BuildCastle { type: 'BuildCastle'; countyId: string; design: CastleType; }
export interface SendSupplies {
  type: 'SendSupplies';
  fromCountyId: string;
  toCountyId: string;
  grainSacks?: number;
  cows?: number;
}
export interface BuyAle { type: 'BuyAle'; countyId: string; }
/** Move one of your armies to a destination tile (must be reachable). */
export interface MoveArmy { type: 'MoveArmy'; armyId: string; col: number; row: number; }
export interface EndTurn { type: 'EndTurn'; }

/** The full set of commands a client may send. */
export type Command =
  | SetTaxRate
  | SetRation
  | SetLabourPolicy
  | AssignField
  | BuildCastle
  | SendSupplies
  | BuyAle
  | MoveArmy
  | EndTurn;

/** Context the server supplies when dispatching: who is acting + the RNG used
 *  if the command advances the world. */
export interface CommandContext {
  /** Realm id on whose authority the command is issued (ownership checks). */
  actorRealmId: string;
  /** Required only for EndTurn; the deterministic RNG to tick the world with. */
  rng?: Rng;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
  /** Present when the command advanced the world (EndTurn). */
  report?: TurnReport;
}

export const ok = (report?: TurnReport): CommandResult => ({ ok: true, report });
export const err = (error: string): CommandResult => ({ ok: false, error });
