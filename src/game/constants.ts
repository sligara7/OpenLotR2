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

import { CastleType, Industry, UnitType } from './types/enums.ts';

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

// --- Starting economy (scenario balance) ----------------------------------
// A new county must be able to FEED ITSELF, or it spirals into famine before
// its first harvest (the balance gap the README flagged). One fully-worked
// grain field feeds GRAIN_SACKS_PER_FIELD*GRAIN_YIELD_MULTIPLIER/4 people per
// season (~50 at the defaults); scenarios derive each county's grain-field
// count from its population so production matches consumption with a margin.
/** Target ratio of annual grain harvest to annual consumption at game start
 *  (>1 so counties stockpile, can divert labour to industry, and feed armies). */
export const FOOD_SURPLUS_TARGET = 1.35;
/** Seasons of grain a county begins with — enough to eat until the first Fall
 *  harvest (a Spring start is two seasons of eating away from it). */
export const STARTING_FOOD_SEASONS = 3;

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
// defenseMultiplier: walls multiply the garrison's fighting strength in a siege
// — the manual says "the advantage becomes greater the larger and more complex
// the castle is." garrison is the design's max defender capacity.
export const CASTLE_SPEC: Record<
  CastleType,
  { wood: number; stone: number; workUnits: number; garrison: number; taxBonus: number; defenseMultiplier: number }
> = {
  [CastleType.None]: { wood: 0, stone: 0, workUnits: 0, garrison: 0, taxBonus: 0, defenseMultiplier: 1 },
  [CastleType.WoodenPalisade]: { wood: 40, stone: 0, workUnits: 60, garrison: 20, taxBonus: 0.1, defenseMultiplier: 1.5 },
  [CastleType.MotteAndBailey]: { wood: 60, stone: 20, workUnits: 120, garrison: 40, taxBonus: 0.2, defenseMultiplier: 2 },
  [CastleType.NormanKeep]: { wood: 40, stone: 120, workUnits: 240, garrison: 80, taxBonus: 0.35, defenseMultiplier: 3 },
  [CastleType.StoneCastle]: { wood: 60, stone: 240, workUnits: 420, garrison: 140, taxBonus: 0.55, defenseMultiplier: 4 },
  [CastleType.RoyalCastle]: { wood: 100, stone: 480, workUnits: 720, garrison: 240, taxBonus: 0.8, defenseMultiplier: 5 },
};

// --- Armies & foraging (armies live off the land they occupy) -------------
// An army feeds itself from the county it stands on: each season it forages
// grain then beef from that county's local stores, drawing them down — so an
// occupying force weakens the land it sits on, friendly or foe. When the
// occupied county cannot meet the army's appetite (barren land, enemy ground
// stripped bare, or no county at all) the shortfall starves a fraction of the
// unfed soldiers. Supply convoys — feeding armies from the treasury across
// friendly tiles, and intercepting an enemy's — are a future system; until
// then, occupation is the only supply line.
export const ARMY_FORAGE_PORTIONS_PER_SOLDIER = 1; // a soldier eats like a peasant
export const ARMY_STARVE_FRACTION = 0.25; // share of unfed soldiers lost/season

// --- Combat (auto-resolved field battles) ---------------------------------
// The manual is purely qualitative on battle math (decline a battle and "it is
// calculated automatically"), so this is a tunable strength model: each side's
// power is its soldier count times terrain/posture modifiers and a random swing;
// casualties scale with the enemy's share of total power. Unit types (archers,
// knights, the rock-paper-scissors matchups) are a future increment that will
// feed richer per-side power.
export const COMBAT = {
  /** ± fraction of random swing applied to each side's power each battle. */
  powerVariance: 0.2,
  /** Casualty lethality; >1 lets a decisive power edge annihilate the loser. */
  lethality: 1.4,
  /** Small edge for the side that is attacked in the open (knows the ground). */
  defenderBonus: 1.1,
} as const;

// --- Unit types (Manual Part-4 "Armies") ----------------------------------
// The manual is qualitative (no stat numbers), so attack/defence are our tunable
// design. attack drives the damage a unit deals; defence reduces the casualties
// it takes. Cost (iron/wood per soldier) is used when raising units — the
// conscription/weapons economy is a later increment.
export const UNIT_SPEC: Record<
  UnitType,
  { attack: number; defence: number; iron: number; wood: number }
> = {
  [UnitType.Peasant]:     { attack: 1, defence: 1, iron: 0, wood: 0 },
  [UnitType.Maceman]:     { attack: 3, defence: 2, iron: 1, wood: 1 },
  [UnitType.Pikeman]:     { attack: 2, defence: 4, iron: 1, wood: 1 },
  [UnitType.Archer]:      { attack: 3, defence: 1, iron: 0, wood: 2 },
  [UnitType.Crossbowman]: { attack: 4, defence: 2, iron: 1, wood: 1 },
  [UnitType.Swordsman]:   { attack: 4, defence: 4, iron: 2, wood: 1 },
  [UnitType.Knight]:      { attack: 6, defence: 5, iron: 3, wood: 1 },
};

// Raising troops (Manual Part-4): the blacksmith forges one weapon type from the
// realm's iron+wood; conscription turns county population into soldiers, arming
// non-peasants from that armory. Peasants need no weapon.
export const WEAPON_LABOUR_PER_UNIT = 2; // blacksmith crew-seasons to forge one weapon
export const MIN_ARMY_SIZE = 50; // "an army must have at least 50 soldiers"

// Movement points an army may spend each turn. A plain tile costs 1; crossing a
// river edge costs RIVER_CROSS_COST extra (maps/movement.ts). An army marches as
// far along its route as its budget allows, then halts until next turn — so
// distance, terrain and rivers all shape maneuver. (Per-unit speed — knights
// fast, pikes slow — is a future refinement; for now every army moves the same.)
export const ARMY_MOVEMENT_POINTS = 5;
/** Unit types that require a weapon from the armory to raise (everyone but the
 *  pitchfork-wielding peasant). */
export const ARMED_UNITS: readonly UnitType[] = [
  UnitType.Maceman, UnitType.Pikeman, UnitType.Archer,
  UnitType.Crossbowman, UnitType.Swordsman, UnitType.Knight,
];
export const needsWeapon = (u: UnitType): boolean => u !== UnitType.Peasant;

// MATCHUP[attacker][defender] multiplies the attacker's damage against that
// defender — the rock-paper-scissors spine from the manual. Omitted pairs are
// neutral (1.0). Archers shred the unarmored but glance off plate; crossbows
// punch through armour and unhorse knights; macemen run down missile troops;
// knights crush most things but fear the crossbow; pikemen brace against cavalry.
export const UNIT_NEUTRAL_MATCHUP = 1.0;
export const UNIT_MATCHUP: Partial<Record<UnitType, Partial<Record<UnitType, number>>>> = {
  [UnitType.Archer]:      { Peasant: 1.5, Maceman: 1.0, Archer: 1.3, Crossbowman: 1.2, Pikeman: 0.5, Swordsman: 0.4, Knight: 0.4 },
  [UnitType.Crossbowman]: { Swordsman: 1.6, Knight: 1.8, Pikeman: 1.4, Maceman: 1.1 },
  [UnitType.Maceman]:     { Archer: 1.6, Crossbowman: 1.6, Peasant: 1.5, Knight: 0.6 },
  [UnitType.Knight]:      { Peasant: 1.5, Maceman: 1.4, Archer: 1.6, Swordsman: 1.3, Crossbowman: 0.5, Pikeman: 0.7 },
  [UnitType.Pikeman]:     { Knight: 1.8, Maceman: 1.2 },
  [UnitType.Swordsman]:   { Archer: 1.4, Peasant: 1.4, Maceman: 1.2 },
  [UnitType.Peasant]:     {},
};

// --- Sieges (multi-season; the only way to take a garrisoned castle) -------
// A besieging army batters the castle over several seasons (bigger army → faster,
// per the manual) while foraging starves the garrison. The siege resolves to an
// assault (or a starve-out surrender) that flips the county to the attacker.
export const SIEGE = {
  /** Breach progress per season when besieger size equals the wall-backed
   *  garrison strength; scales with the army:defence ratio (bigger → faster). */
  baseProgressPerSeason: 0.2,
  /** Cap on how much the size ratio can accelerate a siege. */
  maxProgressPerSeason: 0.6,
  /** Castle damage added per season under bombardment (persists until repaired). */
  damagePerSeason: 0.15,
  /** Garrison soldiers raised per starting castle, as a fraction of its design
   *  garrison capacity (CASTLE_SPEC.garrison). */
  startingGarrisonFraction: 0.6,
} as const;

// --- Conquest (a county changing hands) -----------------------------------
export const CONQUEST = {
  /** A freshly conquered populace resents its new lord — happiness is capped
   *  to this until the conqueror wins them over. */
  conqueredHappiness: 25,
} as const;

/** Share of ALL counties a realm must hold to win by conquest (dominating the
 *  map even with rivals still alive). Last-realm-standing also wins. */
export const VICTORY_COUNTY_FRACTION = 0.5;

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
