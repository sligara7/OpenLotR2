/* County construction & small pure helpers. */

import {
  CastleType,
  FieldStatus,
  HealthLevel,
  Industry,
  RationLevel,
} from '../types/enums.ts';
import { HEALTH_BANDS } from '../constants.ts';
import type { County, Field, IndustrySite } from '../types/county.ts';

export interface CountyInit {
  id: string;
  name: string;
  ownerId?: string | null;
  population?: number;
  happiness?: number;
  health?: number;
  taxRate?: number;
  fieldCount?: number;
  cows?: number;
  grainSacks?: number;
  /** Which optional industries physically exist here (Blacksmith is implied). */
  industries?: Partial<Record<Industry, boolean>>;
  castle?: CastleType;
}

function makeField(): Field {
  return { status: FieldStatus.Fallow, grainGrowth: 0, sacksPlanted: 0, reclaim: 0 };
}

function makeIndustries(
  present: Partial<Record<Industry, boolean>> | undefined,
): Record<Industry, IndustrySite> {
  const site = (has: boolean): IndustrySite => ({ present: has, operational: has });
  return {
    [Industry.Lumber]: site(present?.Lumber ?? false),
    [Industry.Quarry]: site(present?.Quarry ?? false),
    [Industry.IronMine]: site(present?.IronMine ?? false),
    // Every county has a blacksmith (Manual Part-3 "Blacksmith").
    [Industry.Blacksmith]: site(true),
    // The castle "industry" is only active while a build/repair is underway.
    [Industry.Castle]: { present: true, operational: false },
  };
}

export function createCounty(init: CountyInit): County {
  const fields: Field[] = [];
  for (let i = 0; i < (init.fieldCount ?? 6); i++) fields.push(makeField());

  const health = init.health ?? 70;
  return {
    id: init.id,
    name: init.name,
    ownerId: init.ownerId ?? null,
    population: init.population ?? 1000,
    happiness: init.happiness ?? 60,
    health,
    healthLabel: healthLevelFor(health),
    taxRate: init.taxRate ?? 20,
    wantedRation: RationLevel.Normal,
    achievedRation: RationLevel.Normal,
    fields,
    food: { grainSacks: init.grainSacks ?? 0, cows: init.cows ?? 0 },
    industries: makeIndustries(init.industries),
    castle: { type: init.castle ?? CastleType.None, buildProgress: init.castle ? 1 : 0, damage: 0 },
    labour: { industryShare: 0.5, grainBeefBalance: 0.5 },
    recentConscription: 0,
    aleSeasons: 0,
    revolting: false,
    unrestSeasons: 0,
    lastHappinessDelta: { taxes: 0, health: 0, rations: 0, conscription: 0, events: 0, ale: 0 },
  };
}

/** Map a 0..100 health scalar to one of the five display levels. */
export function healthLevelFor(health: number): HealthLevel {
  for (const band of HEALTH_BANDS) {
    if (health <= band.max) return band.label as HealthLevel;
  }
  return HealthLevel.Perfect;
}

export function fieldsWith(county: County, status: FieldStatus): Field[] {
  return county.fields.filter((f) => f.status === status);
}
