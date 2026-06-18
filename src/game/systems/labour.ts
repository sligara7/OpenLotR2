/*
 * Labour allocation.
 *
 * Manual Part-3 "Labor": the slider splits the workforce between agriculture
 * and industry; within each side, workers divide *equally among operational
 * tasks that need them*. Tasks with no work (e.g. iron mining with no mine)
 * receive nobody. This module turns a county's LabourPolicy into a concrete
 * head-count per task; production.ts consumes that.
 */

import { FieldStatus, Industry } from '../types/enums.ts';
import type { County } from '../types/county.ts';

export interface LabourAllocation {
  grainFarming: number;
  cattleRaising: number;
  reclamation: number;
  lumber: number;
  quarry: number;
  ironMine: number;
  blacksmith: number;
  castle: number;
  /** Workers with no operational task to join (the "blue outline" idle pool). */
  idle: number;
}

const ZERO: LabourAllocation = {
  grainFarming: 0,
  cattleRaising: 0,
  reclamation: 0,
  lumber: 0,
  quarry: 0,
  ironMine: 0,
  blacksmith: 0,
  castle: 0,
  idle: 0,
};

/** Which agriculture tasks currently have work to do. */
function activeAgTasks(county: County): (keyof LabourAllocation)[] {
  const tasks: (keyof LabourAllocation)[] = [];
  const hasGrain = county.fields.some((f) => f.status === FieldStatus.Grain);
  const hasCattle =
    county.food.cows > 0 && county.fields.some((f) => f.status === FieldStatus.Cattle);
  const hasBarren = county.fields.some((f) => f.status === FieldStatus.Barren);
  if (hasGrain) tasks.push('grainFarming');
  if (hasCattle) tasks.push('cattleRaising');
  if (hasBarren) tasks.push('reclamation');
  return tasks;
}

/** Which industry tasks are operational and therefore staffable. */
function activeIndustryTasks(county: County): (keyof LabourAllocation)[] {
  const tasks: (keyof LabourAllocation)[] = [];
  if (county.industries[Industry.Lumber].operational) tasks.push('lumber');
  if (county.industries[Industry.Quarry].operational) tasks.push('quarry');
  if (county.industries[Industry.IronMine].operational) tasks.push('ironMine');
  if (county.industries[Industry.Blacksmith].operational) tasks.push('blacksmith');
  if (county.industries[Industry.Castle].operational) tasks.push('castle');
  return tasks;
}

function distribute(
  alloc: LabourAllocation,
  workers: number,
  tasks: (keyof LabourAllocation)[],
): number {
  if (tasks.length === 0) return workers; // all idle
  const each = workers / tasks.length;
  for (const t of tasks) (alloc[t] as number) += each;
  return 0;
}

export function allocateLabour(county: County): LabourAllocation {
  const alloc: LabourAllocation = { ...ZERO };
  const workforce = county.population;
  const toIndustry = workforce * county.labour.industryShare;
  const toAgriculture = workforce - toIndustry;

  let idle = 0;
  idle += distribute(alloc, toAgriculture, activeAgTasks(county));
  idle += distribute(alloc, toIndustry, activeIndustryTasks(county));
  alloc.idle = idle;
  return alloc;
}
