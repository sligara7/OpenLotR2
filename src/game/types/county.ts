/* County state shape. A county is the unit of population & local economy. */

import type {
  CastleType,
  FieldStatus,
  HealthLevel,
  Industry,
  RationLevel,
  UnitType,
  Weather,
} from './enums.ts';

/** A single field that can be farmed, grazed, or reclaimed. */
export interface Field {
  status: FieldStatus;
  /** Grain growth 0..1 across the planting cycle (only used when Grain). */
  grainGrowth: number;
  /** Sacks sown in this field this year (up to GRAIN_SACKS_PER_FIELD). */
  sacksPlanted: number;
  /** Reclamation progress 0..1 (only used when Barren and being reclaimed). */
  reclaim: number;
}

/** Food held *locally* in a county. Grain & cows move only via transport;
 *  dairy is produced and consumed within a season and never stored. */
export interface CountyFood {
  grainSacks: number;
  cows: number;
}

/** Which industries physically exist in the county, and whether the ruler has
 *  switched each on. A county can only produce stone if it *has* a quarry. */
export interface IndustrySite {
  present: boolean;
  operational: boolean;
  /** Max output per season this site can sustain (from the county's resource
   *  tiles). Undefined = unbounded (labour-limited only). */
  capacity?: number;
}

/** Castle state for the county (only one castle per county, per the manual). */
export interface Castle {
  type: CastleType;
  /** 0..1 build progress of the current project (1 == complete). */
  buildProgress: number;
  /** Damage 0..1 (post-siege); blocks full effectiveness until repaired. */
  damage: number;
  /** Soldiers defending the castle. A garrisoned castle (garrison > 0) can only
   *  be taken by siege; an empty one is captured by occupying the county town. */
  garrison: number;
}

/**
 * Labour intent set by the player.
 *  - industryShare in [0,1]: fraction of peasants sent to industry vs farming.
 *  - grainBeefBalance in [0,1]: ration slider, 0 == all grain, 1 == all beef.
 *  Advanced per-task overrides can be layered on later (Advanced Labor Panel).
 */
export interface LabourPolicy {
  industryShare: number;
  grainBeefBalance: number;
}

/** A bookkeeping record of why happiness moved this season (for the report). */
export interface HappinessDelta {
  taxes: number;
  health: number;
  rations: number;
  conscription: number;
  events: number;
  ale: number;
}

export interface County {
  id: string;
  name: string;
  /** id of the owning realm, or null if unowned/neutral. */
  ownerId: string | null;

  population: number;
  /** 0..100. */
  happiness: number;
  /** 0..100 internal scalar; bucketed to HealthLevel for display. */
  health: number;
  healthLabel: HealthLevel;

  /** Percentage 0..100 of income taken each season. */
  taxRate: number;
  /** Ration the ruler set vs. what could actually be served. */
  wantedRation: RationLevel;
  achievedRation: RationLevel;

  fields: Field[];
  food: CountyFood;
  industries: Record<Industry, IndustrySite>;
  castle: Castle;
  labour: LabourPolicy;
  /** Weapon the county blacksmith is currently forging (a unit type), or null
   *  when idle. Output pools to the realm's shared armory (treasury.weapons). */
  blacksmithProduct: UnitType | null;

  /** Soldiers conscripted from this county this season (drives unhappiness). */
  recentConscription: number;
  /** Seasons of ale happiness remaining (temporary boost). */
  aleSeasons: number;
  /** True while peasants are in open revolt. */
  revolting: boolean;
  /** Consecutive seasons spent at/near zero happiness (revolt countdown). */
  unrestSeasons: number;
  /** Seasons of post-conquest occupation during which the county cannot revolt
   *  (the garrison keeps order while the new lord wins the people over). */
  pacifiedSeasons: number;

  lastHappinessDelta: HappinessDelta;

  /** This season's weather (Advanced Farming). Mild when the option is off. */
  weather: Weather;
  /** Soil fertility 0..1 (Advanced Farming): rises while a third of fields stay
   *  fallow, declines when over-cropped. 1 when the option is off. */
  fertility: number;
}
