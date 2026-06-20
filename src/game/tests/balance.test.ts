/*
 * Balance regression: the Britain world must be survivable.
 *
 * The starting economy once collapsed everywhere by year two — counties out-ate
 * their farms (too few grain fields for the population) and famine spiralled into
 * extinction. Grain-field count is now derived from population so each county is
 * self-sufficient. These tests guard that property so it can't silently regress.
 */

import { test, assert, assertGreater } from '../testing/harness.ts';
import { createBritainWorld } from '../scenarios.ts';
import { createRng } from '../rng.ts';
import { advanceSeason } from '../engine.ts';
import {
  FOOD_SURPLUS_TARGET,
  GRAIN_SACKS_PER_FIELD,
  GRAIN_YIELD_MULTIPLIER,
} from '../constants.ts';
import { FieldStatus } from '../types/enums.ts';

function totalPopulation(state: ReturnType<typeof createBritainWorld>): number {
  return Object.values(state.counties).reduce((s, c) => s + c.population, 0);
}

test('balance: every county starts able to out-produce its consumption', () => {
  const world = createBritainWorld();
  const annualPerField = GRAIN_SACKS_PER_FIELD * GRAIN_YIELD_MULTIPLIER;
  for (const c of Object.values(world.counties)) {
    const grainFields = c.fields.filter((f) => f.status === FieldStatus.Grain).length;
    const harvest = grainFields * annualPerField;
    const consumption = c.population * 4; // four seasons at Normal ration
    assertGreater(harvest, consumption, `${c.id} grain harvest must exceed consumption`);
  }
  // The surplus target is a >1 ratio, so this should always hold.
  assertGreater(FOOD_SURPLUS_TARGET, 1, 'surplus target is a real surplus');
});

test('balance: the world does not collapse over four years (no famine spiral)', () => {
  const world = createBritainWorld();
  const rng = createRng(20260620);
  const startPop = totalPopulation(world);
  const startById = new Map(Object.values(world.counties).map((c) => [c.id, c.population]));

  for (let i = 0; i < 16; i++) advanceSeason(world, rng);

  // Aggregate health, robust to the boom-bust each fertile county rides around
  // its carrying capacity: the world as a whole grows rather than craters.
  assertGreater(totalPopulation(world), startPop, 'total population grows over four passive years');

  let died = 0;
  let grew = 0;
  for (const c of Object.values(world.counties)) {
    if (c.population === 0) died += 1;
    if (c.population >= (startById.get(c.id) ?? 0)) grew += 1;
  }
  assert(died === 0, 'no county is depopulated to extinction');
  assertGreater(grew, Object.keys(world.counties).length / 2, 'most counties end at least as big as they began');
});
