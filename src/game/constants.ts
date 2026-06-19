/*
 * BALANCE CONSTANTS
 * =================
 * The Lords II manual (doc/game/Part-*.rst) describes mechanics qualitatively,
 * not numerically. Every number below is therefore a *tunable* starting point
 * chosen to reproduce the documented relationships. Keep all balance tuning in
 * this one file so designers never have to hunt through system code.
 *
 * Citations point at the manual section that motivates each value.
 */

import { CastleType, Industry } from './types/enums.ts';

// --- Food & rations -------------------------------------------------------
// One "portion" feeds one peasant for one season at Normal ration.
export const GRAIN_SACKS_PER_PORTION = 1; // sacks eaten per person at Normal
export const BEEF_PORTIONS_PER_COW = 4; // people one slaughtered cow feeds
export const DAIRY_PORTIONS_PER_COW = 1.2; // people one living cow feeds/season

// --- Agriculture (Manual Part-3 "Agriculture", "Grain", "Cattle") ---------
export const GRAIN_SACKS_PER_FIELD = 5; // "Up to 5 sacks ... in one field"
// Harvest sacks per sack sown. High by design: one field's annual harvest must
// feed many people across all four seasons (5 sown * 40 = 200 sacks ~= feeds
// 50 people/season). NOTE: agriculture yields are the least-pinned-down balance
// numbers — see README "Known balance gaps" for the tuning pass still owed.
export const GRAIN_YIELD_MULTIPLIER = 40;
export const GRAIN_WORKERS_PER_FIELD = 8; // labour to fully work one field
export const CATTLE_GROWTH_RATE = 0.15; // herd increase/season when tended
export const CATTLE_WORKERS_PER_COW = 0.5; // labour to fully tend the herd
export const CATTLE_FIELD_CAPACITY = 12; // cows per field before overcrowding
export const RECLAIM_MAX_PER_SEASON = 0.25; // "never ... more than a quarter"
export const RECLAIM_WORKERS_PER_FIELD = 10;

// --- Industry (Manual Part-3 "Industry") ----------------------------------
export const WOOD_PER_WORKER = 1.5;
export const STONE_PER_WORKER = 1.0;
export const IRON_PER_WORKER = 0.8;
/** Minimum recommended crew used for the "time to build" estimate. */
export const MIN_INDUSTRY_CREW = 5;

// Per-tile production ceilings (Manual: a county can only produce what its land
// holds). One resource tile sustains this much output per season regardless of
// how many extra workers pile on — so geography caps industry, not just labour.
export const WOOD_PER_TILE = 8;
export const STONE_PER_TILE = 6;
export const IRON_PER_TILE = 5;

// --- Castles (Manual Part-3 "Castle Building") ----------------------------
/** Material cost & garrison capacity per design. workUnits = total labour-
 *  seasons to build from scratch (progress accrues at builders/workUnits). */
export const CASTLE_SPEC: Record<
  CastleType,
  { wood: number; stone: number; workUnits: number; garrison: number; taxBonus: number }
> = {
  [CastleType.None]: { wood: 0, stone: 0, workUnits: 0, garrison: 0, taxBonus: 0 },
  [CastleType.WoodenPalisade]: { wood: 40, stone: 0, workUnits: 60, garrison: 20, taxBonus: 0.1 },
  [CastleType.MotteAndBailey]: { wood: 60, stone: 20, workUnits: 120, garrison: 40, taxBonus: 0.2 },
  [CastleType.NormanKeep]: { wood: 40, stone: 120, workUnits: 240, garrison: 80, taxBonus: 0.35 },
  [CastleType.StoneCastle]: { wood: 60, stone: 240, workUnits: 420, garrison: 140, taxBonus: 0.55 },
  [CastleType.RoyalCastle]: { wood: 100, stone: 480, workUnits: 720, garrison: 240, taxBonus: 0.8 },
};

// --- Taxes (Manual Part-3 "Taxes", "Castles and Tax Revenues") ------------
export const TAX_GOLD_PER_PERSON = 0.05; // crowns per person at 100% rate
/** Tax rate (0..100) the populace tolerates before happiness suffers. */
export const TAX_TOLERANCE = 30;

// --- Health (Manual Part-3 "Health") --------------------------------------
// Health drifts toward a target each season based on achieved ration.
export const HEALTH_DRIFT = 8; // points/season moved toward target
export const HEALTH_TARGET_BY_RATION: Record<string, number> = {
  None: 0,
  Quarter: 25,
  Half: 45,
  Normal: 70,
  Double: 88,
  Triple: 100,
};
/** Health 0..100 cut points -> the five display levels (low to high). */
export const HEALTH_BANDS: { max: number; label: string }[] = [
  { max: 20, label: 'Diseased' },
  { max: 40, label: 'Sick' },
  { max: 60, label: 'Average' },
  { max: 80, label: 'Good' },
  { max: 100, label: 'Perfect' },
];

// --- Happiness (Manual Part-3 "Happiness") --------------------------------
// Per-factor seasonal happiness deltas (added then clamped to 0..100).
export const HAPPINESS = {
  /** Penalty per tax-rate point above TAX_TOLERANCE. */
  taxPenaltyPerPoint: 0.6,
  /** Small reward for taxing below tolerance (people feel well-treated). */
  lowTaxReward: 0.15,
  /** Health contribution: (health-50)/50 * scale. */
  healthScale: 6,
  /** Ration effect: >=Normal raises, below lowers. */
  rationBonusNormalPlus: 4, // per ration step at/above Normal (Double=+8...)
  rationPenaltyBelowNormal: 8, // per ration step below Normal
  /** Penalty per percent of population conscripted this season. */
  conscriptionPenaltyPerPct: 1.2,
  /** Ale: flat boost while aleSeasons > 0. */
  aleBonus: 10,
  /** Happiness lost while a revolt is active in-county. */
  revoltPenalty: 15,
} as const;

/** Below this happiness for REVOLT_PATIENCE seasons, the county revolts. */
export const REVOLT_THRESHOLD = 8;
export const REVOLT_PATIENCE = 3;

/** Ale bought from a merchant: gold cost and how many seasons the boost lasts.
 *  (Manual Part-3: "its effects are temporary".) */
export const ALE_COST = 50;
export const ALE_DURATION = 2;

// --- Population (Manual Part-3 "Population Growth") ------------------------
export const POP = {
  /** Base births as a fraction of population per season. */
  birthRateBase: 0.02,
  /** Extra births scaling with happiness (at 100 happiness). */
  birthRateHappy: 0.04,
  /** Base deaths as a fraction of population per season. */
  deathRateBase: 0.015,
  /** Extra deaths when health is poor (at 0 health). */
  deathRatePoorHealth: 0.06,
  /** Emigration scales with unhappiness below this pivot. */
  emigrationPivot: 40,
  emigrationRatePerPoint: 0.001, // fraction/season per happiness point below pivot
  /** Chance of a baby-boom event per season, and its multiplier. */
  babyBoomChance: 0.05,
  babyBoomMultiplier: 2.5,
} as const;

// --- Immigration (Manual Part-3: moves toward happier neighbours) ---------
export const IMMIGRATION = {
  /** Fraction of the happiness gap (per season) that migrates per neighbour. */
  ratePerHappinessGap: 0.002,
  /** Only migrate when the gap exceeds this, to avoid jitter. */
  minGap: 5,
} as const;

// --- Plague (Manual Part-3 "Health": random, unpreventable) ---------------
export const PLAGUE = {
  chancePerSeason: 0.03,
  popKillFraction: 0.12,
  healthHit: 30,
} as const;

/** Industries that always physically exist in every county. */
export const UNIVERSAL_INDUSTRIES: Industry[] = [Industry.Blacksmith];
