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

import type { CastleType, FieldStatus, RationLevel, UnitType } from '../types/enums.ts';
import type { UnitCounts } from '../types/army.ts';
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
/** Dispatch a supply convoy carrying `grainSacks` of food from one of your
 *  counties toward one of your armies; it travels (and can be intercepted). */
export interface SendConvoy { type: 'SendConvoy'; fromCountyId: string; toArmyId: string; grainSacks: number; }
/** Move one of your armies to a destination tile (must be reachable). Occupying
 *  a hostile, undefended county captures it; a garrisoned castle needs a siege. */
export interface MoveArmy { type: 'MoveArmy'; armyId: string; col: number; row: number; }
/** Sail an army across a sea crossing (ferry link) to an adjacent county it
 *  can't reach by land. Spends the turn's movement; may capture on landing. */
export interface FerryArmy { type: 'FerryArmy'; armyId: string; toCountyId: string; }
/** Attack an enemy army with one of yours (auto-resolved field battle). */
export interface AttackArmy { type: 'AttackArmy'; armyId: string; targetArmyId: string; }
/** Lay (or keep up) a siege on the garrisoned-castle county your army occupies. */
export interface LaySiege { type: 'LaySiege'; armyId: string; countyId: string; }
/** Set which weapon a county's blacksmith forges (null = idle). */
export interface SetBlacksmith { type: 'SetBlacksmith'; countyId: string; product: UnitType | null; }
/** Raise `count` soldiers of `unit` from a county's population into an army
 *  (reinforce `armyId` if given and present, else muster a new one at the town).
 *  Non-peasants consume matching weapons from the armory. */
export interface Conscript { type: 'Conscript'; countyId: string; unit: UnitType; count: number; armyId?: string; }
/** Hire a self-armed mercenary band of `count` `unit`s at a county town (no
 *  population/happiness cost, but a steep up-front fee from the treasury). */
export interface HireMercenaries { type: 'HireMercenaries'; countyId: string; unit: UnitType; count: number; }
/** Disband an army standing in your own county: its soldiers rejoin the
 *  population and any weapons return to the armory (mercenaries simply disperse). */
export interface DisbandArmy { type: 'DisbandArmy'; armyId: string; }
/** Split the given units off an army into a NEW army on the same tile (both the
 *  remainder and the new army must keep at least MIN_ARMY_SIZE soldiers). */
export interface SplitArmy { type: 'SplitArmy'; armyId: string; units: Partial<UnitCounts>; }
/** Merge one army into another of yours sharing the same tile. */
export interface CombineArmy { type: 'CombineArmy'; armyId: string; intoArmyId: string; }
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
  | SendConvoy
  | MoveArmy
  | FerryArmy
  | AttackArmy
  | LaySiege
  | SetBlacksmith
  | Conscript
  | HireMercenaries
  | DisbandArmy
  | SplitArmy
  | CombineArmy
  | EndTurn;

/** Context the server supplies when dispatching: who is acting + the RNG used
 *  if the command advances the world. */
export interface CommandContext {
  /** Realm id on whose authority the command is issued (ownership checks). */
  actorRealmId: string;
  /** Deterministic RNG. Required by EndTurn (to tick the world) and AttackArmy
   *  (to resolve the battle); other commands ignore it. */
  rng?: Rng;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
  /** Present when the command advanced the world (EndTurn). */
  report?: TurnReport;
  /** Command-specific payload (e.g. a field-battle result from AttackArmy). */
  data?: unknown;
}

export const ok = (report?: TurnReport, data?: unknown): CommandResult => ({ ok: true, report, data });
export const err = (error: string): CommandResult => ({ ok: false, error });
