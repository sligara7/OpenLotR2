/*
 * Production — turns allocated labour into goods for the season.
 *
 * Agriculture (Manual Part-3 "Grain", "Cattle"):
 *   - Grain follows the seasonal cycle: sown in Winter, grows Spring/Summer,
 *     harvested in Fall. A field plants up to GRAIN_SACKS_PER_FIELD sacks and
 *     returns GRAIN_YIELD_MULTIPLIER sacks each, scaled by the labour ratio.
 *   - Cattle yield dairy every season (consumed in food.ts) and the herd grows
 *     when tended and not overcrowded.
 * Industry (Manual Part-3 "Industry"): wood/stone/iron flow to the shared
 * treasury; castle building advances the current project.
 *
 * FUTURE: blacksmith weapon output, quarry/mine depletion, weather damage
 * (parched/flooded) belong here too — left as clearly-marked stubs for now.
 */

import { FieldStatus, Season } from '../types/enums.ts';
import {
  CATTLE_FIELD_CAPACITY,
  CATTLE_GROWTH_RATE,
  CATTLE_WORKERS_PER_COW,
  DAIRY_PORTIONS_PER_COW,
  GRAIN_SACKS_PER_FIELD,
  GRAIN_WORKERS_PER_FIELD,
  GRAIN_YIELD_MULTIPLIER,
  IRON_PER_WORKER,
  RECLAIM_MAX_PER_SEASON,
  RECLAIM_WORKERS_PER_FIELD,
  STONE_PER_WORKER,
  WOOD_PER_WORKER,
  CASTLE_SPEC,
  UNIT_SPEC,
  WEAPON_LABOUR_PER_UNIT,
} from '../constants.ts';
import { seasonalGrainDemand, weatherYieldFactor, fertilityYieldFactor } from './farming.ts';
import type { County } from '../types/county.ts';
import type { Treasury } from '../types/realm.ts';
import type { LabourAllocation } from './labour.ts';

/** Expected total grainGrowth across a mild growing season (sow + spring +
 *  summer) — the divisor that normalises advanced-farming yield to ~1.0. */
const NOMINAL_GROWTH = 0.25 + 0.37 + 0.37;

export interface ProductionSummary {
  /** People that this season's dairy alone can feed (consumed in food.ts). */
  dairyPortions: number;
  grainHarvested: number;
  wood: number;
  stone: number;
  iron: number;
  /** Weapons forged by the blacksmith this season (banked to the armory). */
  weapons: number;
  castleCompleted: boolean;
}

/** ratio of available to required workers, capped at 1 (0 when none needed). */
function labourRatio(workers: number, needed: number): number {
  if (needed <= 0) return 0;
  return Math.min(1, workers / needed);
}

function runAgriculture(
  county: County,
  alloc: LabourAllocation,
  season: Season,
  advanced: boolean,
  summary: ProductionSummary,
): void {
  const grainFields = county.fields.filter((f) => f.status === FieldStatus.Grain);
  const cattleFields = county.fields.filter((f) => f.status === FieldStatus.Cattle);
  const barrenFields = county.fields.filter((f) => f.status === FieldStatus.Barren);

  // --- Grain seasonal cycle -------------------------------------------------
  // Under advanced farming grain wants different head-counts each season, and
  // weather (folded into grainGrowth) plus soil fertility scale the harvest.
  const seasonDemand = advanced ? seasonalGrainDemand(season) : 1;
  const grainNeed = grainFields.length * GRAIN_WORKERS_PER_FIELD * seasonDemand;
  const grainLabour = labourRatio(alloc.grainFarming, grainNeed);
  const weatherStep = advanced ? weatherYieldFactor(county.weather) : 1;
  if (season === Season.Winter) {
    // Sow: draw sacks from the local store, up to capacity & labour.
    for (const f of grainFields) {
      const want = Math.round(GRAIN_SACKS_PER_FIELD * grainLabour);
      const sown = Math.min(want, county.food.grainSacks);
      f.sacksPlanted = sown;
      f.grainGrowth = sown > 0 ? 0.25 * weatherStep : 0;
      county.food.grainSacks -= sown;
    }
  } else if (season === Season.Spring || season === Season.Summer) {
    for (const f of grainFields) {
      if (f.sacksPlanted <= 0) continue;
      // Easy play caps growth at 1 (cosmetic); advanced lets weather push it
      // above or below so the autumn harvest reflects the whole season.
      f.grainGrowth = advanced ? f.grainGrowth + 0.37 * weatherStep : Math.min(1, f.grainGrowth + 0.37);
    }
  } else if (season === Season.Fall) {
    for (const f of grainFields) {
      let harvest = f.sacksPlanted * GRAIN_YIELD_MULTIPLIER * grainLabour;
      if (advanced) {
        // grainGrowth carries the growing-season weather; normalise it to ~1
        // under mild conditions, then weight by soil fertility.
        harvest *= (f.grainGrowth / NOMINAL_GROWTH) * fertilityYieldFactor(county);
      }
      summary.grainHarvested += harvest;
      county.food.grainSacks += harvest;
      f.sacksPlanted = 0;
      f.grainGrowth = 0;
    }
  }

  // --- Cattle: dairy every season, herd grows when tended -------------------
  if (cattleFields.length > 0 && county.food.cows > 0) {
    const tend = labourRatio(alloc.cattleRaising, county.food.cows * CATTLE_WORKERS_PER_COW);
    const capacity = cattleFields.length * CATTLE_FIELD_CAPACITY;
    const crowding = Math.min(1, county.food.cows / capacity);
    // Dairy is produced now; consumed by food.ts.
    summary.dairyPortions = county.food.cows * tend * (1 - 0.3 * crowding) * DAIRY_PORTIONS_PER_COW;
    // Overcrowding throttles growth (cows need room to graze).
    const growth = CATTLE_GROWTH_RATE * tend * (1 - crowding);
    county.food.cows = Math.min(capacity, county.food.cows * (1 + growth));
  }

  // --- Reclaiming barren fields (max a quarter per season) ------------------
  if (barrenFields.length > 0) {
    const ratio = labourRatio(alloc.reclamation, barrenFields.length * RECLAIM_WORKERS_PER_FIELD);
    for (const f of barrenFields) {
      f.reclaim = Math.min(1, f.reclaim + RECLAIM_MAX_PER_SEASON * ratio);
      if (f.reclaim >= 1) {
        f.status = FieldStatus.Fallow;
        f.reclaim = 0;
      }
    }
  }
}

function runIndustry(
  county: County,
  alloc: LabourAllocation,
  treasury: Treasury,
  summary: ProductionSummary,
): void {
  // Output is the lesser of what the labour can make and what the land (tile
  // capacity) can sustain. capacity undefined => labour-limited only.
  if (county.industries.Lumber.operational) {
    summary.wood = Math.min(alloc.lumber * WOOD_PER_WORKER, county.industries.Lumber.capacity ?? Infinity);
    treasury.wood += summary.wood;
  }
  if (county.industries.Quarry.operational) {
    summary.stone = Math.min(alloc.quarry * STONE_PER_WORKER, county.industries.Quarry.capacity ?? Infinity);
    treasury.stone += summary.stone;
  }
  if (county.industries.IronMine.operational) {
    summary.iron = Math.min(alloc.ironMine * IRON_PER_WORKER, county.industries.IronMine.capacity ?? Infinity);
    treasury.iron += summary.iron;
  }
  // Blacksmith: forge the chosen weapon, limited by its crew and the realm's
  // iron+wood. Output pools to the shared armory (treasury.weapons), where
  // conscription draws it to arm new units.
  if (county.industries.Blacksmith.operational && county.blacksmithProduct) {
    const spec = UNIT_SPEC[county.blacksmithProduct];
    const byLabour = Math.floor(alloc.blacksmith / WEAPON_LABOUR_PER_UNIT);
    const byIron = spec.iron > 0 ? Math.floor(treasury.iron / spec.iron) : Infinity;
    const byWood = spec.wood > 0 ? Math.floor(treasury.wood / spec.wood) : Infinity;
    const made = Math.max(0, Math.min(byLabour, byIron, byWood));
    if (made > 0) {
      treasury.iron -= made * spec.iron;
      treasury.wood -= made * spec.wood;
      treasury.weapons[county.blacksmithProduct] = (treasury.weapons[county.blacksmithProduct] ?? 0) + made;
      summary.weapons = made;
    }
  }

  // Castle construction: advance the active project, drawing materials as
  // available. Progress is gated by both labour and accumulated materials.
  if (county.industries.Castle.operational && county.castle.type !== 'None') {
    const spec = CASTLE_SPEC[county.castle.type];
    if (spec.workUnits > 0) {
      const labourProgress = alloc.castle / spec.workUnits;
      // Material readiness: have we drawn enough wood+stone for the work so far?
      const drawWood = Math.min(treasury.wood, spec.wood * labourProgress);
      const drawStone = Math.min(treasury.stone, spec.stone * labourProgress);
      treasury.wood -= drawWood;
      treasury.stone -= drawStone;
      const materialRatio = spec.wood + spec.stone > 0
        ? (drawWood + drawStone) / ((spec.wood + spec.stone) * labourProgress || 1)
        : 1;
      county.castle.buildProgress += labourProgress * materialRatio;
      if (county.castle.buildProgress >= 1) {
        county.castle.buildProgress = 1;
        county.industries.Castle.operational = false;
        summary.castleCompleted = true;
      }
    }
  }
}

export function runProduction(
  county: County,
  alloc: LabourAllocation,
  treasury: Treasury,
  season: Season,
  advanced = false,
): ProductionSummary {
  const summary: ProductionSummary = {
    dairyPortions: 0,
    grainHarvested: 0,
    wood: 0,
    stone: 0,
    iron: 0,
    weapons: 0,
    castleCompleted: false,
  };
  runAgriculture(county, alloc, season, advanced, summary);
  runIndustry(county, alloc, treasury, summary);
  return summary;
}
