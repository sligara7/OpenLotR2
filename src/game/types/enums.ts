/*
 * Core enumerations for the King of the Lands simulation.
 *
 * NOTE: these are `as const` objects + union types rather than TypeScript
 * `enum`s on purpose. Node's `--experimental-strip-types` (how we run the
 * headless sim without a build step) cannot transform real `enum`s. This
 * pattern is also friendlier to tree-shaking and JSON serialisation.
 */

/** The four seasons. One season == one turn. (Manual: grain is planted
 *  winter->spring and harvested fall->winter.) */
export const Season = {
  Winter: 'Winter',
  Spring: 'Spring',
  Summer: 'Summer',
  Fall: 'Fall',
} as const;
export type Season = (typeof Season)[keyof typeof Season];

/** Turn order of the seasons; advancing wraps Fall -> Winter and ticks year. */
export const SEASON_ORDER: readonly Season[] = [
  Season.Spring,
  Season.Summer,
  Season.Fall,
  Season.Winter,
];

/** Ration the ruler *wants* to provide. (Manual Part-3 "Feast or Famine?".) */
export const RationLevel = {
  None: 'None',
  Quarter: 'Quarter',
  Half: 'Half',
  Normal: 'Normal',
  Double: 'Double',
  Triple: 'Triple',
} as const;
export type RationLevel = (typeof RationLevel)[keyof typeof RationLevel];

/** Food-per-person multiplier for each ration level (Normal == 1 portion). */
export const RATION_MULTIPLIER: Record<RationLevel, number> = {
  None: 0,
  Quarter: 0.25,
  Half: 0.5,
  Normal: 1,
  Double: 2,
  Triple: 3,
};

/** Health is tracked internally as 0..100 but reported as one of five levels.
 *  (Manual: "perfect, good, average, sick, and diseased".) */
export const HealthLevel = {
  Diseased: 'Diseased',
  Sick: 'Sick',
  Average: 'Average',
  Good: 'Good',
  Perfect: 'Perfect',
} as const;
export type HealthLevel = (typeof HealthLevel)[keyof typeof HealthLevel];

/** Field usage. (Manual Part-3 "Field Usage".) */
export const FieldStatus = {
  Fallow: 'Fallow',
  Barren: 'Barren',
  Grain: 'Grain',
  Cattle: 'Cattle',
  Parched: 'Parched',
  Flooded: 'Flooded',
} as const;
export type FieldStatus = (typeof FieldStatus)[keyof typeof FieldStatus];

/** Industries a county may operate. (Manual Part-3 "Industry".) */
export const Industry = {
  Lumber: 'Lumber',
  Quarry: 'Quarry',
  IronMine: 'IronMine',
  Blacksmith: 'Blacksmith',
  Castle: 'Castle',
} as const;
export type Industry = (typeof Industry)[keyof typeof Industry];

/** Castle designs, simplest -> grandest. (Manual Part-3 "Castle Building".) */
export const CastleType = {
  None: 'None',
  WoodenPalisade: 'WoodenPalisade',
  MotteAndBailey: 'MotteAndBailey',
  NormanKeep: 'NormanKeep',
  StoneCastle: 'StoneCastle',
  RoyalCastle: 'RoyalCastle',
} as const;
export type CastleType = (typeof CastleType)[keyof typeof CastleType];

/** Soldier types that make up an army. (Manual Part-4 "Armies".) Their attack/
 *  defence and the rock-paper-scissors matchups live in constants.ts. */
export const UnitType = {
  Peasant: 'Peasant',
  Maceman: 'Maceman',
  Pikeman: 'Pikeman',
  Archer: 'Archer',
  Crossbowman: 'Crossbowman',
  Swordsman: 'Swordsman',
  Knight: 'Knight',
} as const;
export type UnitType = (typeof UnitType)[keyof typeof UnitType];

/** Every unit type in a stable order (display, iteration, serialisation). */
export const UNIT_TYPES: readonly UnitType[] = [
  UnitType.Peasant,
  UnitType.Maceman,
  UnitType.Pikeman,
  UnitType.Archer,
  UnitType.Crossbowman,
  UnitType.Swordsman,
  UnitType.Knight,
];

/** Computer-ruler personalities. (Manual Part-7 "The Players".) */
export const NoblePersonality = {
  Knight: 'Knight',
  Countess: 'Countess',
  Bishop: 'Bishop',
  Baron: 'Baron',
} as const;
export type NoblePersonality =
  (typeof NoblePersonality)[keyof typeof NoblePersonality];
