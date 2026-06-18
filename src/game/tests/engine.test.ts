/* Engine integration: full multi-season turns over a small world. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { createRng } from '../rng.ts';
import { advanceSeason } from '../engine.ts';
import { Season } from '../types/enums.ts';
import type { GameState } from '../types/realm.ts';

function sampleWorld(): GameState {
  const player = createRealm({ id: 'p1', name: 'Player', isHuman: true, gold: 200 });
  const rival = createRealm({ id: 'p2', name: 'Rival' });
  const york = createCounty({
    id: 'york', name: 'York', ownerId: 'p1', population: 1200, happiness: 70,
    taxRate: 20, grainSacks: 400, cows: 30, fieldCount: 8, industries: { Lumber: true, Quarry: true },
  });
  const kent = createCounty({
    id: 'kent', name: 'Kent', ownerId: 'p2', population: 900, happiness: 35,
    taxRate: 55, grainSacks: 100, cows: 10, fieldCount: 6,
  });
  return createWorld({
    realms: [player, rival], counties: [york, kent], edges: [['york', 'kent']], season: Season.Spring,
  });
}

test('engine: a run keeps happiness in [0,100] and population non-negative', () => {
  const w = sampleWorld();
  const rng = createRng(12345);
  for (let i = 0; i < 12; i++) {
    const report = advanceSeason(w, rng);
    for (const c of report.counties) {
      assert(c.happiness >= 0 && c.happiness <= 100, `happiness in range for ${c.countyId}`);
      assert(c.population >= 0, `population non-negative for ${c.countyId}`);
    }
  }
});

test('engine: the calendar advances and years roll over after Winter', () => {
  const w = sampleWorld();
  const rng = createRng(1);
  assertEqual(w.season, Season.Spring, 'starts in spring');
  assertEqual(w.year, 1, 'starts in year 1');
  for (let i = 0; i < 4; i++) advanceSeason(w, rng); // one full year
  assertEqual(w.turn, 4, 'four turns elapsed');
  assertEqual(w.year, 2, 'a new year began');
  assertEqual(w.season, Season.Spring, 'back to spring');
});

test('engine: identical seed + state produce identical results (determinism)', () => {
  const runFinalPop = (): number => {
    const w = sampleWorld();
    const rng = createRng(999);
    for (let i = 0; i < 16; i++) advanceSeason(w, rng);
    return w.counties.york.population + w.counties.kent.population;
  };
  assertEqual(runFinalPop(), runFinalPop(), 'two runs match exactly');
});
