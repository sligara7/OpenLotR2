/*
 * Headless demo — runs a small world for a few years and prints each season,
 * so you can SEE the population / happiness / economy loop working without any
 * graphics. This is the "prove the loop end-to-end" checkpoint from the plan.
 *
 * Run with:  node --experimental-strip-types src/game/demo.ts
 * (or via the npm "sim" script / tsx).
 */

import { createCounty } from './state/county.ts';
import { createRealm } from './state/realm.ts';
import { createWorld } from './state/world.ts';
import { createRng } from './rng.ts';
import { advanceSeason } from './engine.ts';
import { FieldStatus, Season } from './types/enums.ts';
import type { County } from './types/county.ts';

/** Put a working farm in place: assign fields to grain/cattle and lean labour
 *  toward agriculture, so the county can actually feed itself from turn one. */
function farm(county: County, grainFields: number, cattleFields: number): County {
  let i = 0;
  for (; i < grainFields && i < county.fields.length; i++) {
    county.fields[i].status = FieldStatus.Grain;
    county.fields[i].sacksPlanted = 5; // already in the ground (pre-harvest)
    county.fields[i].grainGrowth = 1;
  }
  for (let j = 0; j < cattleFields && i < county.fields.length; j++, i++) {
    county.fields[i].status = FieldStatus.Cattle;
  }
  county.labour.industryShare = 0.35; // most hands on the land
  return county;
}

const player = createRealm({ id: 'p1', name: 'You', isHuman: true, gold: 200 });
const rival = createRealm({ id: 'p2', name: 'Baron de Vere' });

const counties = [
  farm(createCounty({
    id: 'york', name: 'York', ownerId: 'p1', population: 320, happiness: 70,
    taxRate: 15, grainSacks: 1500, cows: 60, fieldCount: 8,
    industries: { Lumber: true, Quarry: true },
  }), 4, 4),
  farm(createCounty({
    id: 'lancaster', name: 'Lancaster', ownerId: 'p1', population: 240, happiness: 60,
    taxRate: 18, grainSacks: 1200, cows: 40, fieldCount: 6, industries: { IronMine: true },
  }), 3, 3),
  farm(createCounty({
    id: 'kent', name: 'Kent', ownerId: 'p2', population: 300, happiness: 35,
    taxRate: 55, grainSacks: 1000, cows: 30, fieldCount: 6,
  }), 3, 3),
];

const world = createWorld({
  realms: [player, rival],
  counties,
  edges: [['york', 'lancaster'], ['lancaster', 'kent']],
  season: Season.Spring,
});

const rng = createRng(20260618);

const pad = (s: string | number, n: number): string => String(s).padStart(n);

console.log('OpenLotR2 — headless simulation demo (4 years)\n');
console.log('Yr Season  County      Pop   Happy Health Ration  Tax+  Notes');
console.log('-- ------- ----------- ----- ----- ------ ------- ----- -----------------');

for (let i = 0; i < 16; i++) {
  const report = advanceSeason(world, rng);
  for (const c of report.counties) {
    const county = world.counties[c.countyId];
    const notes: string[] = [];
    if (c.plague) notes.push('PLAGUE');
    if (c.revoltTriggered) notes.push('REVOLT!');
    if (c.castleCompleted) notes.push('castle built');
    if (report.migration[c.countyId] > 0) notes.push(`+${report.migration[c.countyId]} migrants`);
    if (report.migration[c.countyId] < 0) notes.push(`${report.migration[c.countyId]} migrants`);
    console.log(
      `${pad(report.year, 2)} ${report.season.padEnd(7)} ${county.name.padEnd(11)} ` +
      `${pad(c.population, 5)} ${pad(c.happiness, 5)} ${pad(c.health, 6)} ` +
      `${c.achievedRation.padEnd(7)} ${pad(c.taxGold, 5)} ${notes.join(', ')}`,
    );
  }
  console.log('');
}

console.log(`Treasury — ${player.name}: ${Math.round(player.treasury.gold)} gold, ` +
  `${Math.round(player.treasury.wood)} wood, ${Math.round(player.treasury.stone)} stone, ` +
  `${Math.round(player.treasury.iron)} iron`);
