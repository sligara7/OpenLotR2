/*
 * Zod schemas for the command protocol — the validated request bodies clients
 * POST to the server. This is the SOURCE OF TRUTH for the wire format: it drives
 * both runtime validation and the generated OpenAPI spec.
 *
 * A compile-time guard at the bottom asserts these schemas stay structurally
 * identical to the core `Command` type in game/commands/types.ts, so the two
 * can never silently diverge.
 */
import { z } from './zod.ts';
import { CastleTypeSchema, FieldUseSchema, RationLevelSchema, UnitTypeSchema } from './enums.ts';
import type { Command } from '../../game/commands/index.ts';

const countyId = z.string().openapi({ example: 'york' });

export const SetTaxRateSchema = z.object({
  type: z.literal('SetTaxRate'),
  countyId,
  rate: z.number().min(0).max(100).openapi({ example: 25 }),
});

export const SetRationSchema = z.object({
  type: z.literal('SetRation'),
  countyId,
  level: RationLevelSchema,
});

export const SetLabourPolicySchema = z.object({
  type: z.literal('SetLabourPolicy'),
  countyId,
  industryShare: z.number().min(0).max(1).optional(),
  grainBeefBalance: z.number().min(0).max(1).optional(),
});

export const AssignFieldSchema = z.object({
  type: z.literal('AssignField'),
  countyId,
  fieldIndex: z.number().int().nonnegative(),
  use: FieldUseSchema,
});

export const BuildCastleSchema = z.object({
  type: z.literal('BuildCastle'),
  countyId,
  design: CastleTypeSchema,
});

export const SendSuppliesSchema = z.object({
  type: z.literal('SendSupplies'),
  fromCountyId: z.string(),
  toCountyId: z.string(),
  grainSacks: z.number().nonnegative().optional(),
  cows: z.number().nonnegative().optional(),
});

export const BuyAleSchema = z.object({ type: z.literal('BuyAle'), countyId });

export const MoveArmySchema = z.object({
  type: z.literal('MoveArmy'),
  armyId: z.string(),
  col: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
});

export const AttackArmySchema = z.object({
  type: z.literal('AttackArmy'),
  armyId: z.string(),
  targetArmyId: z.string(),
});

export const LaySiegeSchema = z.object({
  type: z.literal('LaySiege'),
  armyId: z.string(),
  countyId,
});

export const SetBlacksmithSchema = z.object({
  type: z.literal('SetBlacksmith'),
  countyId,
  product: UnitTypeSchema.nullable(),
});

export const ConscriptSchema = z.object({
  type: z.literal('Conscript'),
  countyId,
  unit: UnitTypeSchema,
  count: z.number().int().positive(),
  armyId: z.string().optional(),
});

const PartialUnitCountsSchema = z.object({
  Peasant: z.number().optional(),
  Maceman: z.number().optional(),
  Pikeman: z.number().optional(),
  Archer: z.number().optional(),
  Crossbowman: z.number().optional(),
  Swordsman: z.number().optional(),
  Knight: z.number().optional(),
});

export const DisbandArmySchema = z.object({ type: z.literal('DisbandArmy'), armyId: z.string() });

export const SplitArmySchema = z.object({
  type: z.literal('SplitArmy'),
  armyId: z.string(),
  units: PartialUnitCountsSchema,
});

export const CombineArmySchema = z.object({
  type: z.literal('CombineArmy'),
  armyId: z.string(),
  intoArmyId: z.string(),
});

export const EndTurnSchema = z.object({ type: z.literal('EndTurn') });

export const CommandSchema = z
  .discriminatedUnion('type', [
    SetTaxRateSchema,
    SetRationSchema,
    SetLabourPolicySchema,
    AssignFieldSchema,
    BuildCastleSchema,
    SendSuppliesSchema,
    BuyAleSchema,
    MoveArmySchema,
    AttackArmySchema,
    LaySiegeSchema,
    SetBlacksmithSchema,
    ConscriptSchema,
    DisbandArmySchema,
    SplitArmySchema,
    CombineArmySchema,
    EndTurnSchema,
  ])
  .openapi('Command');

export type CommandInput = z.infer<typeof CommandSchema>;

// --- Compile-time drift guard --------------------------------------------
// Asserts the Zod-inferred CommandInput is structurally identical to the core
// Command type. If either changes without the other, `tsc` (npm run typecheck)
// fails on the line below.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export type _CommandContractInSync = Expect<Equal<CommandInput, Command>>;
