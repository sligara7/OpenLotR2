/*
 * Public API for the headless OpenLotR2 simulation core.
 *
 * The renderer (Phaser scenes) and any AI/tools should depend ONLY on what is
 * re-exported here, never reach into individual system files. This keeps the
 * simulation a swappable, independently-testable module.
 */

// Types
export * from './types/enums.ts';
export type { County, Field, CountyFood, Castle, LabourPolicy, HappinessDelta } from './types/county.ts';
export type { Realm, Treasury, GameState, Adjacency } from './types/realm.ts';

// State construction
export { createCounty, healthLevelFor } from './state/county.ts';
export type { CountyInit } from './state/county.ts';
export { createRealm, adjustTreasury } from './state/realm.ts';
export type { RealmInit } from './state/realm.ts';
export { createWorld, neighboursOf, countiesOfRealm } from './state/world.ts';
export type { WorldInit } from './state/world.ts';

// Engine
export { advanceSeason } from './engine.ts';
export type { TurnReport, CountyTurnReport } from './engine.ts';

// Command protocol (the client/server API boundary)
export { dispatch } from './commands/index.ts';
export type {
  Command,
  CommandContext,
  CommandResult,
} from './commands/index.ts';

// RNG
export { createRng } from './rng.ts';
export type { Rng } from './rng.ts';

// Constants (so designers/tools can read balance values)
export * as Balance from './constants.ts';
