/*
 * Public API for the headless King of the Lands simulation core.
 *
 * The renderer (Phaser scenes) and any AI/tools should depend ONLY on what is
 * re-exported here, never reach into individual system files. This keeps the
 * simulation a swappable, independently-testable module.
 */

// Types
export * from './types/enums.ts';
export type { County, Field, CountyFood, Castle, LabourPolicy, HappinessDelta } from './types/county.ts';
export type { Realm, Treasury, GameState, Adjacency } from './types/realm.ts';
export type { Army } from './types/army.ts';

// State construction
export { createCounty, healthLevelFor } from './state/county.ts';
export type { CountyInit } from './state/county.ts';
export { createRealm, adjustTreasury } from './state/realm.ts';
export type { RealmInit } from './state/realm.ts';
export { createWorld, neighboursOf, countiesOfRealm } from './state/world.ts';
export type { WorldInit } from './state/world.ts';
export { createDemoWorld, createBritainWorld } from './scenarios.ts';

// Maps
export { BRITAIN, MAPS, mapEdges, regionIds } from './maps/index.ts';
export type { GameMap, MapRegion, Country } from './maps/index.ts';

// Engine
export { advanceSeason } from './engine.ts';
export type { TurnReport, CountyTurnReport } from './engine.ts';
export { forageArmies } from './systems/foraging.ts';
export type { ForageLedger, ArmyForageResult } from './systems/foraging.ts';

// Combat & siege (auto-resolved combined-arms battles; multi-season sieges)
export { resolveBattle, garrisonComposition } from './systems/combat.ts';
export type { BattleResult, SideResult, Force } from './systems/combat.ts';
export { createArmy, unitsOf, unitsTotal, emptyUnits, unitsSpeed, armyMovementAllowance } from './state/army.ts';
export type { ArmyInit } from './state/army.ts';
export type { UnitCounts } from './types/army.ts';
export { payWages } from './systems/wages.ts';
export type { WagesLedger, RealmWages } from './systems/wages.ts';
export { advanceConvoys } from './systems/convoys.ts';
export type { ConvoyLedger, ConvoyOutcome } from './systems/convoys.ts';
export type { Convoy } from './types/convoy.ts';
export { advanceSieges, garrisonStrength, engineBuildCost, engineBreach } from './systems/siege.ts';
export type { SiegeLedger, SiegeOutcome, SiegeStatus } from './systems/siege.ts';
export { captureCounty, updateEliminations, realmIsAlive, evaluateOutcome } from './systems/conquest.ts';
export type { Siege, SiegeEngines, SiegeEngineType } from './types/siege.ts';
export type { GameOutcome } from './types/realm.ts';

// Diplomacy (realm-to-realm relations: opinion, alliances, enemies, offers)
export {
  emptyDiplomacy,
  ensureDiplomacy,
  relKey,
  opinionOf,
  adjustOpinion,
  setOpinion,
  opinionBand,
  areAllied,
  areEnemies,
  formAlliance,
  breakAlliance,
  markEnemy,
  registerHostility,
  runDiplomacy,
  addRequest,
  requestsTo,
  noteCompliment,
  complimentReady,
} from './systems/diplomacy.ts';
export type { DiplomacyLedger, HostilityResult } from './systems/diplomacy.ts';
export { DiploMessageType, OpinionBand } from './types/diplomacy.ts';
export type { DiplomacyState, DiploProposal, Alliance, AllyRequest } from './types/diplomacy.ts';

// AI rulers (drive non-human realms via the command protocol)
export { takeAiTurns, planRealmTurn, isAiRealm, TRAITS_BY_PERSONALITY } from './ai/index.ts';
export type { AiTurnLog, AiRealmLog, AiTraits } from './ai/index.ts';

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
