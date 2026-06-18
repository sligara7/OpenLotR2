/*
 * Zod schemas for the GameState response and the per-turn report. Mirrors the
 * core types in game/types/* and game/engine.ts. Compile-time guards at the
 * bottom assert they stay in sync with those types.
 */
import { z } from './zod.ts';
import {
  CastleTypeSchema,
  FieldStatusSchema,
  HealthLevelSchema,
  NoblePersonalitySchema,
  RationLevelSchema,
  SeasonSchema,
} from './enums.ts';
import type { GameState } from '../../game/types/realm.ts';
import type { TurnReport } from '../../game/engine.ts';

// --- County ---------------------------------------------------------------
const FieldSchema = z.object({
  status: FieldStatusSchema,
  grainGrowth: z.number(),
  sacksPlanted: z.number(),
  reclaim: z.number(),
});

const IndustrySiteSchema = z.object({ present: z.boolean(), operational: z.boolean() });

const IndustriesSchema = z.object({
  Lumber: IndustrySiteSchema,
  Quarry: IndustrySiteSchema,
  IronMine: IndustrySiteSchema,
  Blacksmith: IndustrySiteSchema,
  Castle: IndustrySiteSchema,
});

const HappinessDeltaSchema = z.object({
  taxes: z.number(),
  health: z.number(),
  rations: z.number(),
  conscription: z.number(),
  events: z.number(),
  ale: z.number(),
});

export const CountySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    ownerId: z.string().nullable(),
    population: z.number(),
    happiness: z.number(),
    health: z.number(),
    healthLabel: HealthLevelSchema,
    taxRate: z.number(),
    wantedRation: RationLevelSchema,
    achievedRation: RationLevelSchema,
    fields: z.array(FieldSchema),
    food: z.object({ grainSacks: z.number(), cows: z.number() }),
    industries: IndustriesSchema,
    castle: z.object({
      type: CastleTypeSchema,
      buildProgress: z.number(),
      damage: z.number(),
    }),
    labour: z.object({ industryShare: z.number(), grainBeefBalance: z.number() }),
    recentConscription: z.number(),
    aleSeasons: z.number(),
    revolting: z.boolean(),
    unrestSeasons: z.number(),
    lastHappinessDelta: HappinessDeltaSchema,
  })
  .openapi('County');

// --- Realm ----------------------------------------------------------------
export const RealmSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    personality: NoblePersonalitySchema.nullable(),
    isHuman: z.boolean(),
    treasury: z.object({
      gold: z.number(),
      wood: z.number(),
      stone: z.number(),
      iron: z.number(),
      weapons: z.record(z.string(), z.number()),
    }),
    eliminated: z.boolean(),
  })
  .openapi('Realm');

// --- GameState ------------------------------------------------------------
export const GameStateSchema = z
  .object({
    year: z.number(),
    season: SeasonSchema,
    turn: z.number(),
    realms: z.record(z.string(), RealmSchema),
    counties: z.record(z.string(), CountySchema),
    adjacency: z.record(z.string(), z.array(z.string())),
  })
  .openapi('GameState');

// --- TurnReport -----------------------------------------------------------
const CountyTurnReportSchema = z.object({
  countyId: z.string(),
  population: z.number(),
  happiness: z.number(),
  health: z.number(),
  achievedRation: z.string(),
  taxGold: z.number(),
  births: z.number(),
  deaths: z.number(),
  emigrants: z.number(),
  plague: z.boolean(),
  revoltTriggered: z.boolean(),
  castleCompleted: z.boolean(),
});

export const TurnReportSchema = z
  .object({
    turn: z.number(),
    year: z.number(),
    season: SeasonSchema,
    counties: z.array(CountyTurnReportSchema),
    migration: z.record(z.string(), z.number()),
  })
  .openapi('TurnReport');

// --- Compile-time drift guards --------------------------------------------
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export type _GameStateInSync = Expect<Equal<z.infer<typeof GameStateSchema>, GameState>>;
export type _TurnReportInSync = Expect<Equal<z.infer<typeof TurnReportSchema>, TurnReport>>;
