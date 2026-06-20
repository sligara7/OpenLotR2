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
  UnitTypeSchema,
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

const IndustrySiteSchema = z.object({
  present: z.boolean(),
  operational: z.boolean(),
  capacity: z.number().optional(),
});

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
      garrison: z.number(),
    }),
    labour: z.object({ industryShare: z.number(), grainBeefBalance: z.number() }),
    blacksmithProduct: UnitTypeSchema.nullable(),
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

// --- Army -----------------------------------------------------------------
const UnitCountsSchema = z.object({
  Peasant: z.number(),
  Maceman: z.number(),
  Pikeman: z.number(),
  Archer: z.number(),
  Crossbowman: z.number(),
  Swordsman: z.number(),
  Knight: z.number(),
});

export const ArmySchema = z
  .object({
    id: z.string(),
    ownerId: z.string(),
    col: z.number(),
    row: z.number(),
    countyId: z.string().nullable(),
    units: UnitCountsSchema,
    soldiers: z.number(),
    movement: z.number(),
  })
  .openapi('Army');

// --- Siege ----------------------------------------------------------------
export const SiegeSchema = z
  .object({
    countyId: z.string(),
    attackerRealmId: z.string(),
    besiegerArmyId: z.string(),
    progress: z.number(),
    seasons: z.number(),
  })
  .openapi('Siege');

// --- Outcome --------------------------------------------------------------
export const GameOutcomeSchema = z
  .object({
    winnerId: z.string().nullable(),
    reason: z.enum(['conquest', 'last-standing', 'defeat', 'extinction']),
  })
  .openapi('GameOutcome');

// --- GameState ------------------------------------------------------------
export const GameStateSchema = z
  .object({
    year: z.number(),
    season: SeasonSchema,
    turn: z.number(),
    realms: z.record(z.string(), RealmSchema),
    counties: z.record(z.string(), CountySchema),
    adjacency: z.record(z.string(), z.array(z.string())),
    armies: z.record(z.string(), ArmySchema),
    sieges: z.record(z.string(), SiegeSchema),
    outcome: GameOutcomeSchema.nullable(),
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

const ArmyForageResultSchema = z.object({
  armyId: z.string(),
  countyId: z.string().nullable(),
  needed: z.number(),
  foraged: z.number(),
  starved: z.number(),
  destroyed: z.boolean(),
});

const ForageLedgerSchema = z.object({
  armies: z.array(ArmyForageResultSchema),
});

const SiegeOutcomeSchema = z.object({
  countyId: z.string(),
  attackerRealmId: z.string(),
  besiegerArmyId: z.string(),
  progress: z.number(),
  seasons: z.number(),
  garrison: z.number(),
  garrisonStarved: z.number(),
  status: z.enum(['ongoing', 'stormed', 'starved', 'repulsed', 'lifted']),
  captured: z.boolean(),
});

const SiegeLedgerSchema = z.object({
  sieges: z.array(SiegeOutcomeSchema),
});

const RealmWagesSchema = z.object({
  realmId: z.string(),
  due: z.number(),
  paid: z.number(),
  deserted: z.number(),
});

const WagesLedgerSchema = z.object({
  realms: z.array(RealmWagesSchema),
});

export const TurnReportSchema = z
  .object({
    turn: z.number(),
    year: z.number(),
    season: SeasonSchema,
    counties: z.array(CountyTurnReportSchema),
    migration: z.record(z.string(), z.number()),
    forage: ForageLedgerSchema,
    siege: SiegeLedgerSchema,
    wages: WagesLedgerSchema,
    outcome: GameOutcomeSchema.nullable(),
  })
  .openapi('TurnReport');

// --- Compile-time drift guards --------------------------------------------
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export type _GameStateInSync = Expect<Equal<z.infer<typeof GameStateSchema>, GameState>>;
export type _TurnReportInSync = Expect<Equal<z.infer<typeof TurnReportSchema>, TurnReport>>;
