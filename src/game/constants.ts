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
import { TradeGood } from './types/trade.ts';
import type { SiegeEngineType } from './types/siege.ts';

// --- Food & rations -------------------------------------------------------
// One "portion" feeds one peasant for one season at Normal ration.
export const GRAIN_SACKS_PER_PORTION = 1; // sacks eaten per person at Normal
export const BEEF_PORTIONS_PER_COW = 4; // people one slaughtered cow feeds
// A milk cow supports roughly three people indefinitely, where slaughtering her
// feeds four once and ends the herd's future. That ratio is the whole point of
// cattle: at 1.2 a living cow was worth so little against her carcass that
// eating the herd was always correct, and every herd in Britain was gone by
// turn 25 of every game. See systems/food.ts for the measurement.
export const DAIRY_PORTIONS_PER_COW = 3; // people one living cow feeds/season

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
/** Head kept back to breed the herd up again — never slaughtered, never
 *  foraged. Small on purpose: a remnant that makes recovery possible over
 *  years, not a herd anybody can live off. See systems/reserves.ts. */
export const CATTLE_BREEDING_STOCK = 4;
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
/** Fleeces a shepherd brings in per season. Low per head — wool's worth is in
 *  its PRICE, not its volume: a sack of wool was worth many sacks of grain. */
export const WOOL_PER_WORKER = 0.6;
export const STONE_PER_WORKER = 1.0;
export const IRON_PER_WORKER = 0.8;
/** Minimum recommended crew used for the "time to build" estimate. */
export const MIN_INDUSTRY_CREW = 5;

// Per-tile production ceilings (Manual: a county can only produce what its land
// holds). One resource tile sustains this much output per season regardless of
// how many extra workers pile on — so geography caps industry, not just labour.
export const WOOD_PER_TILE = 8;
/** Fleeces one pasture tile's flock sustains per season. Sheep were grazed on
 *  the uplands and downs that fed nothing else, which is exactly why wool paid
 *  so well for land that grew no wheat. */
export const WOOL_PER_TILE = 3;
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
// speed = movement points this unit can sustain. An ARMY moves at the speed of
// its SLOWEST present unit (combined arms keep pace with the baggage), so a pure
// cavalry force raids fast while pikes-and-peasants trudge. Relative speeds
// follow the manual: knights fastest (mounted), macemen/archers quick, pikemen
// very slow.
export const UNIT_SPEC: Record<
  UnitType,
  { attack: number; defence: number; iron: number; wood: number; speed: number }
> = {
  [UnitType.Peasant]:     { attack: 1, defence: 1, iron: 0, wood: 0, speed: 9 },
  [UnitType.Maceman]:     { attack: 3, defence: 2, iron: 1, wood: 1, speed: 12 },
  [UnitType.Pikeman]:     { attack: 2, defence: 4, iron: 1, wood: 1, speed: 7 },
  [UnitType.Archer]:      { attack: 3, defence: 1, iron: 0, wood: 2, speed: 12 },
  [UnitType.Crossbowman]: { attack: 4, defence: 2, iron: 1, wood: 1, speed: 9 },
  [UnitType.Swordsman]:   { attack: 4, defence: 4, iron: 2, wood: 1, speed: 9 },
  [UnitType.Knight]:      { attack: 6, defence: 5, iron: 3, wood: 1, speed: 14 },
};

// Raising troops (Manual Part-4): the blacksmith forges one weapon type from the
// realm's iron+wood; conscription turns county population into soldiers, arming
// non-peasants from that armory. Peasants need no weapon.
export const WEAPON_LABOUR_PER_UNIT = 2; // blacksmith crew-seasons to forge one weapon
export const MIN_ARMY_SIZE = 50; // "an army must have at least 50 soldiers"

// An army's movement budget per turn is the speed of its slowest unit (see
// UNIT_SPEC.speed). A plain tile costs 1, a river crossing more (maps/movement.ts);
// the army marches as far along its route as the budget allows, then halts until
// next turn — so distance, terrain, rivers AND composition shape maneuver. This
// constant is only the fallback for a (transient) empty army.
export const ARMY_MOVEMENT_POINTS = 12;

// Supply convoys (the other half of logistics, paired with foraging): a cart
// carries food from a county toward one of your armies, moving this many points
// per turn (slower than troops). It delivers on arrival, topping up the army's
// carried supply so it need not forage; an enemy army sharing its tile destroys
// it (raid the supply line).
export const CONVOY_MOVEMENT_POINTS = 9;

// Upkeep: a standing army draws seasonal wages from the realm treasury (Manual
// Part-4). When a realm cannot pay in full, the unpaid share of every army
// bleeds deserters — so militarism has to be financed.
export const WAGE_PER_SOLDIER = 0.05; // gold per soldier per turn
export const DESERTION_FRACTION = 0.3; // share of UNPAID soldiers that desert each turn

// Mercenaries (Manual Part-4): hireable professionals who arrive self-armed and
// cost no population or happiness — but command a steep up-front fee and far
// higher wages. Two mercenary bands won't serve together (rival clans).
export const MERCENARY_HIRE_COST_PER_SOLDIER = 2; // gold up front to hire
export const MERCENARY_WAGE_MULTIPLIER = 3; // wage vs a citizen soldier
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
  /** Castle damage added per season under bombardment (persists until repaired). */
  damagePerSeason: 0.12,
  /** Garrison soldiers raised per starting castle, as a fraction of its design
   *  garrison capacity (CASTLE_SPEC.garrison). */
  startingGarrisonFraction: 0.6,
  /** Engine-build progress per besieging soldier per turn — a bigger army raises
   *  the siege works faster ("the bigger your army, the less time it will take"). */
  buildPerSoldier: 0.05,
  /** Breach power that fully negates a castle's wall multiplier in the assault. */
  breachToNegate: 8,
} as const;

/** Siege engines (Manual Part-6): `buildCost` is labour-units to construct one,
 *  `breach` is how much it negates the castle's wall advantage in the assault. */
export const SIEGE_ENGINE: Record<SiegeEngineType, { buildCost: number; breach: number }> = {
  catapult: { buildCost: 14, breach: 3.5 }, // batters the walls from afar
  ram: { buildCost: 8, breach: 2.5 }, // splinters the gate
  tower: { buildCost: 12, breach: 3 }, // scales the walls
};

/** Engines a besieger raises by default when none are specified — a modest train
 *  that breaches part of the walls (build more to negate a bigger castle). */
export const DEFAULT_SIEGE_ENGINES = { catapults: 1, rams: 1, towers: 0 };

// --- Conquest (a county changing hands) -----------------------------------
export const CONQUEST = {
  /** A freshly conquered populace resents its new lord — happiness is capped
   *  to this until the conqueror wins them over. */
  conqueredHappiness: 30,
  /** Seasons a newly taken county is held under occupation and cannot revolt,
   *  giving the conqueror time to lower taxes and feed the people (otherwise a
   *  brief post-conquest dip flips it straight back to neutral). */
  pacifySeasons: 4,
} as const;

// Victory comes only by total conquest — the last realm standing, with every
// rival stripped of all counties and armies (see systems/conquest.ts).

/** Default AI behaviour dials (GameOptions.ai) — leaves the AI as designed.
 *  aggression/diplomacy are multipliers on each personality's value; boldness is
 *  the epsilon-greedy exploration rate the maneuver planner reads. */
export const AI_TUNING_DEFAULTS = { aggression: 1, diplomacy: 1, boldness: 0.3 } as const;

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
  /** Grievance bled off each season — a dearth is remembered for a while. */
  grievanceDecay: 3,
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

// --- The tyranny of the wagon ---------------------------------------------
// A cart and its animals eat the cargo. The classic figure, from Engels on
// Alexander and van Creveld's Supplying War, is a pack animal carrying roughly
// 250 lb and eating about 10 lb a day: the column exhausts its own load in
// something like twenty-five days out and back. There is a radius beyond which
// land supply is arithmetically impossible, and every pre-modern campaign was
// shaped by it.
//
// This is the ONE number that turns supply from a flavour note into geography.
// Set it too high and nothing can be supplied anywhere; too low and the wagon
// might as well be free. Judge it with the balance harness, not by argument.

/**
 * Share of what a convoy is carrying that its own escort and draught animals
 * eat for each tile travelled.
 *
 * At 0.035 a column keeps about 70% of its load over ten tiles, half over
 * twenty, and a fifth over forty-five — so a haul across a county or two
 * arrives nearly full, one across Britain arrives empty, and there is a real
 * distance past which sending anything is waste.
 */
export const CONVOY_CONSUMPTION_PER_TILE = 0.035;

/** Below this many portions a convoy has eaten itself and is struck from the
 *  map — the column turned back, or never arrived. */
export const CONVOY_MINIMUM_LOAD = 1;

// --- Holding what you take ------------------------------------------------
// A county walked into and left empty is a county the enemy walks back into
// next season. Measured over twenty AI-versus-AI games, that revolving door was
// why not one of them ever reached a decision: territory changed hands for
// fifty years and no realm could ever be consolidated out of existence.
//
// So a captured county is GARRISONED FROM THE ARMY THAT TOOK IT — which is what
// a medieval captain actually did, and which makes holding land cost something.
// A thin raiding force can take counties or hold them, not both.

/** Share of a castle's full garrison the taking army leaves behind. Below its
 *  full strength on purpose: an occupier is thinner than a prepared defender. */
export const GARRISON_ON_CAPTURE = 0.5;

/** Men left in a county with no castle at all — a watch on the town, enough
 *  that the county cannot simply be strolled back into, not enough to hold
 *  against a real army. */
export const WATCH_ON_CAPTURE = 20;

// --- Conquest that pays for itself ----------------------------------------
// Garrisoning from the taking army fixed the revolving door and created the
// opposite stall: every county taken cost the field army a permanent
// detachment, nothing ever gave those men back, and so offensive strength
// DECAYED with each victory. Twenty AI-versus-AI games ended 0-for-20 decided
// with the leader frozen at half the map — the Crusader-state failure, where
// every castle held is men not in the field.
//
// The conquerors who actually finished had conquest financing the next
// conquest: Rome's socii and then citizenship turning conquered manpower into
// Roman manpower, the Ottoman timar granting conquered land out in exchange for
// the cavalry that took the next land. So a settled county holds its OWN walls,
// and the conqueror's detachment is the seed of a garrison rather than the whole
// of it.

// ⚠️ The first attempt at this went the WRONG WAY and the harness caught it in
// one run: letting settled counties raise levies up to their walls' full
// establishment helped defenders as much as conquerors. Garrisons went 301 →
// 5,537 men in a single seeded game while field armies stayed at 300–500,
// assaults repulsed tripled, and the map froze harder than before. The gain has
// to land in the FIELD, not on the walls — see systems/garrisons.ts.

export const GARRISON = {
  /** Happiness a county must reach to count as settled rather than merely held.
   *  Above a freshly conquered county's cap (CONQUEST.conqueredHappiness) on
   *  purpose: ground becomes strength only once the people are won over, so a
   *  conquest driven by taxes and hunger goes on costing the men who hold it. */
  settledHappiness: 45,
  /** Men a settled county stands down from its walls each season. A trickle:
   *  an army is recovered over seasons of good governance, not overnight. */
  releasePerSeason: 5,
} as const;

// --- Suing for terms ------------------------------------------------------
// Conquests ended politically far more often than they ended in annihilation:
// realms surrendered, defected, or were partitioned. Grinding every rival to
// zero county by county is the rarest outcome in history, and requiring it is
// why 34 sieges won across twenty games produced no eliminations at all.

export const CAPITULATION = {
  /** A realm sues for terms when a rival holds at least this many times its
   *  land AND this many times its men. Submission was rarely a last stand: the
   *  Anglo-Saxon magnates came to William with shires still in hand, and the
   *  princely states read the arithmetic and submitted intact. What ends a war
   *  is a settled question, not an empty map. */
  dominanceRatio: 3,
  /** ...but never while it still holds this share of the map. A realm with an
   *  eighth of Britain is not beaten, however far ahead the leader is — this is
   *  what keeps an even contest from being conceded. */
  hopelessShare: 0.12,
  /** A realm down to this many counties with no army worth the name is finished
   *  whatever the ratios say, and is spared being hunted acre by acre. */
  countyFloor: 2,
  /** Field strength below which a realm cannot turn anything around. */
  soldierFloor: MIN_ARMY_SIZE,
} as const;

// --- Merchants & the marketplace (Manual Part-3 "Merchants") --------------
// The manual gives no numbers, only the shape: a merchant shows you two prices
// per good, and "you'll notice a large difference between buying and selling
// prices". So each good has ONE base value, and the merchant's margin is applied
// around it — you pay above, you receive below. The gap is the merchant's living
// and the reason hoarding to sell is not free money.
//
// Values are in crowns and are relative to each other rather than researched:
// grain is the cheap bulk good, a knight's mail the dearest thing on the cart.

/** Base worth of one unit of each good, before the merchant takes a margin. */
export const GOOD_VALUE: Record<TradeGood, number> = {
  [TradeGood.Grain]: 4,
  [TradeGood.Cows]: 18,
  [TradeGood.Wood]: 6,
  [TradeGood.Stone]: 8,
  [TradeGood.Iron]: 14,
  // The dearest thing a county can GROW. English fleeces were the best in
  // Europe and the Flemish weavers paid for them accordingly.
  [TradeGood.Wool]: 26,
  [TradeGood.Pikeman]: 30,
  [TradeGood.Maceman]: 34,
  [TradeGood.Archer]: 30,
  [TradeGood.Crossbowman]: 44,
  [TradeGood.Swordsman]: 56,
  [TradeGood.Knight]: 90,
} as const;

/** You PAY this multiple of a good's value, and RECEIVE that one. The spread is
 *  wide on purpose — the manual is blunt that merchants are tough businessmen. */
export const MERCHANT_BUY_MARKUP = 1.35;
export const MERCHANT_SELL_MARGIN = 0.65;

/**
 * Roughly how many seasons a county waits between merchant visits.
 *
 * This is the one knob: the number of wagons is derived from it and the size of
 * the map, so a county trades about this often whether the map has three
 * counties or eighty-two. Six is one or two visits a year — often enough that
 * trade is a real part of a reign, rare enough that a merchant's arrival is
 * worth planning around, which is the balance the manual describes.
 */
export const SEASONS_BETWEEN_VISITS = 6;

// --- Supply and demand ----------------------------------------------------
// A price is not a fact about a good, it is a fact about a good IN A PLACE. A
// merchant standing in a county whose barns hold four years of grain will not
// pay well for grain; one in a county that has just been stripped will pay
// dearly for it, and charge dearly to sell it.
//
// Each good has a REFERENCE holding — what a county or realm would comfortably
// keep — and the price moves against the ratio of what is actually held to that.

/**
 * How sharply price answers supply. 0 would be a fixed price list; 1 would be
 * strict inverse proportion. Around 0.6 a fourfold glut roughly halves the
 * price, which is steep enough to punish hoarding without making a small
 * surplus worthless.
 */
export const PRICE_ELASTICITY = 0.6;

/** Floor and ceiling on the supply multiplier, so no price ever reaches absurdity. */
export const PRICE_FACTOR_MIN = 0.2;
export const PRICE_FACTOR_MAX = 3;

// --- The just price (justum pretium) --------------------------------------
// Scholastic economics held that a good has a fair price and that charging
// beyond it in a dearth was a sin, not a shrewd trade. England enforced it: the
// assizes of bread and ale fixed staple prices, and forestalling — cornering
// supply to resell dear — was a prosecutable offence.
//
// Supply pricing makes selling food out of a starving county the single most
// profitable act available to a ruler. These numbers are what stops that being
// free: the county remembers, and so do the other nobles.

/** Above this supply multiplier a staple counts as scarce, and selling it out
 *  of the county is profiteering rather than trade. 1 is the ordinary price. */
export const JUST_PRICE_THRESHOLD = 1.25;

/** Happiness lost per unit of shortage-scarcity, per tenth of the county's
 *  reference holding sold away. Scaled so a token sale barely registers and
 *  stripping a hungry county is remembered for years. */
export const PROFITEERING_GRIEVANCE = 14;

/** Standing lost with EVERY other noble when a lord is caught at it — famine
 *  profiteering was a public scandal, not a private transaction. */
export const PROFITEERING_REPUTATION_HIT = 4;

/** Goodwill earned for the opposite: carrying food INTO a county that is short.
 *  Good lordship, and the thing a ruler was actually supposed to do. */
export const RELIEF_GOODWILL = 6;

/** Seasons of food a county is reckoned to hold comfortably — a year's grain.
 *  Above this it is a glut and the price sags; below it, a shortage. */
export const REFERENCE_FOOD_SEASONS = 4;

/** A comfortable holding of each material and weapon, PER COUNTY the realm
 *  holds — so a large realm is expected to keep larger stores. */
export const REFERENCE_PER_COUNTY: Record<string, number> = {
  Wood: 80, Stone: 60, Iron: 30, Wool: 40,
  Pikeman: 20, Maceman: 20, Archer: 20, Crossbowman: 15, Swordsman: 15, Knight: 8,
};

/** Crowns a wagon carries to spend, and crowns' worth of goods it carries to
 *  sell, refreshed each time it reaches a new county. */
export const MERCHANT_PURSE = 250;
export const MERCHANT_WARES = 400;

/** Industries that always physically exist in every county. */
export const UNIVERSAL_INDUSTRIES: Industry[] = [Industry.Blacksmith];

// --- Advanced Farming (Manual Part-8 "Advanced Play") ---------------------
// Only in force when GameOptions.advancedFarming is on. Weather and fertility
// scale the grain harvest around the easy-play baseline (both ~1.0 on average),
// and grain labour demand swings with the planting cycle.
export const ADVANCED_FARMING = {
  /** Weather draw: each weather's relative likelihood and its yield factor.
   *  Mild dominates; drought is the painful tail, sunny the lucky one. */
  weather: {
    Drought: { weight: 1, yield: 0.45 },
    Poor:    { weight: 2, yield: 0.8 },
    Mild:    { weight: 4, yield: 1.0 },
    Fair:    { weight: 2, yield: 1.12 },
    Sunny:   { weight: 1, yield: 1.3 },
  },
  /** Grain workers needed per field, by season, as a multiple of the flat
   *  GRAIN_WORKERS_PER_FIELD: light in growing seasons, heavy at harvest,
   *  moderate to ready the ground for sowing in winter. */
  seasonalLabour: { Spring: 0.4, Summer: 0.4, Fall: 1.6, Winter: 1.0 },
  /** Keep at least this fraction of usable fields fallow to hold fertility. */
  idealFallow: 1 / 3,
  /** Fertility eases this far toward its target each season. */
  fertilityStep: 0.12,
  /** Fertility floor when fields are badly over-cropped. */
  fertilityFloor: 0.4,
} as const;

// --- Exploration / fog of war (Manual Part-8 "Advanced Play") -------------
export const EXPLORATION = {
  /** How many hexes around an army are revealed as it travels. Scaled with the
   *  map: at the old resolution 2 hexes was most of a county, at this one it is
   *  a fifth of one, so a scout that revealed a shire would reveal a field. */
  visionRadius: 5,
} as const;

// --- Diplomacy (Manual Part-7 "Diplomacy") --------------------------------
// Opinion is a directional -100..+100 score; gifts/compliments raise it,
// insults and attacks lower it. The bands below colour the relationship bar.
export const DIPLOMACY = {
  /** Hard bounds on any opinion score. */
  opinionMin: -100,
  opinionMax: 100,
  /** Opinion >= this reads "friendly" (green); <= -friendlyBand reads
   *  "hostile" (red); in between is "indifferent" (blue). */
  friendlyBand: 25,
  /** Opinion gained per gold gifted, and the most a single gift can buy
   *  (so you can't simply purchase devotion in one lump). */
  giftOpinionPerGold: 0.05,
  giftOpinionCap: 30,
  /** A compliment is free favour, but its value shrinks as opinion rises —
   *  "too many kind words can work against you". */
  complimentGain: 8,
  /** Compliment the same realm again within this many turns and it reads as
   *  transparent manipulation: the gesture BACKFIRES instead of charming. */
  complimentCooldown: 3,
  complimentBackfire: 6,
  /** Insults sting (and can tip a relationship into permanent enmity). */
  insultPenalty: 18,
  /** Attacking a realm lowers its opinion of you by this much. */
  attackOpinionHit: 25,
  /** At/below this opinion a realm regards you as a permanent ENEMY. */
  enemyThreshold: -75,
  /** AI accepts an alliance offer when it likes the proposer at least this much. */
  allianceMinOpinion: 20,
  /** Forming an alliance warms both sides by this much immediately. */
  allianceFormBonus: 15,
  /** Breaking an alliance the honourable way costs only the other side's regard. */
  breakOpinionHit: 15,
  /** DOUBLECROSS: attacking an ally without terminating first. The victim's
   *  regard craters and EVERY other realm trusts you less. */
  doublecrossVictimHit: 80,
  doublecrossReputationHit: 25,
  /** Each season, opinion drifts this much back toward neutral (0)... */
  opinionDecayPerTurn: 1,
  /** ...except allies, who warm by this much per season instead. */
  allianceWarmthPerTurn: 2,
  /** An unanswered alliance offer expires after this many turns. */
  proposalTtl: 4,
  /** An ally request (help / attack) stands for this many turns before lapsing. */
  requestTtl: 3,
} as const;
