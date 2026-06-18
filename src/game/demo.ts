/*
 * Headless demo — runs a small world for a few years and prints each season,
 * so you can SEE the population / happiness / economy loop working without any
 * graphics. This is the "prove the loop end-to-end" checkpoint from the plan.
 *
 * Run with:  node --experimental-strip-types src/game/demo.ts
 * (or via the npm "sim" script / tsx).
 */

import { createRng } from './rng.ts';
import { advanceSeason } from './engine.ts';
import { createDemoWorld } from './scenarios.ts';

const world = createDemoWorld();
const player = world.realms.p1;

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
