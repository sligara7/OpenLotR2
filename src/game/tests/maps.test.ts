/* Map graph validity + the Britain scenario. */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { BRITAIN, mapEdges, regionIds } from '../maps/index.ts';
import { createBritainWorld } from '../scenarios.ts';
import { createRng } from '../rng.ts';
import { advanceSeason } from '../engine.ts';

test('britain: every neighbour id refers to a real region', () => {
  const ids = regionIds(BRITAIN);
  const bad: string[] = [];
  for (const region of BRITAIN.regions) {
    for (const n of region.neighbours) {
      if (!ids.has(n)) bad.push(`${region.id} -> ${n}`);
    }
  }
  assertEqual(bad.length, 0, `dangling neighbour ids: ${bad.join(', ')}`);
});

test('britain: no region lists itself or duplicate neighbours', () => {
  for (const region of BRITAIN.regions) {
    assert(!region.neighbours.includes(region.id), `${region.id} neighbours itself`);
    assertEqual(
      new Set(region.neighbours).size,
      region.neighbours.length,
      `${region.id} has duplicate neighbours`,
    );
  }
});

test('britain: the whole realm is one connected landmass (incl. ferries)', () => {
  const edges = mapEdges(BRITAIN);
  const adj = new Map<string, string[]>();
  for (const region of BRITAIN.regions) adj.set(region.id, []);
  for (const [a, b] of edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  // BFS from the first region; must reach every region.
  const start = BRITAIN.regions[0].id;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur)!) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  assertEqual(seen.size, BRITAIN.regions.length, 'graph is not fully connected');
});

test('britain: contains all three countries', () => {
  const byCountry = (c: string) => BRITAIN.regions.filter((r) => r.country === c).length;
  assertGreater(byCountry('England'), 0, 'has England');
  assertGreater(byCountry('Wales'), 0, 'has Wales');
  assertGreater(byCountry('Scotland'), 0, 'has Scotland');
});

test('britain scenario: builds a world that simulates without error', () => {
  const world = createBritainWorld();
  assertEqual(Object.keys(world.counties).length, BRITAIN.regions.length, 'all regions present');
  const owned = Object.values(world.counties).filter((c) => c.ownerId !== null).length;
  assertEqual(owned, 9, 'three realms x three starting counties');

  const rng = createRng(2026);
  for (let i = 0; i < 8; i++) {
    const report = advanceSeason(world, rng);
    for (const c of report.counties) {
      assert(c.happiness >= 0 && c.happiness <= 100, `happiness in range for ${c.countyId}`);
      assert(c.population >= 0, `population non-negative for ${c.countyId}`);
    }
  }
});
