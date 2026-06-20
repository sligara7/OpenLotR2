/*
 * Headless AI demo — watch the computer rulers play the Britain map.
 *
 * Each turn: the AI realms take their turn (governance + army maneuver) through
 * the command protocol, then the world ticks. Prints a per-realm scoreboard plus
 * a sample of the commands each ruler issued, so you can SEE the AI making
 * decisions without any graphics.
 *
 * Run with:  npm run sim:ai   (tsx src/game/ai-demo.ts)
 */

import { createRng } from './rng.ts';
import { advanceSeason } from './engine.ts';
import { createBritainWorld } from './scenarios.ts';
import { takeAiTurns } from './ai/index.ts';
import { countiesOfRealm } from './state/world.ts';
import type { GameState } from './types/realm.ts';

const world = createBritainWorld();
const rng = createRng(20260620);

const pad = (s: string | number, n: number): string => String(s).padStart(n);

function realmLine(state: GameState, realmId: string): string {
  const realm = state.realms[realmId];
  const counties = countiesOfRealm(state, realmId);
  const pop = counties.reduce((s, c) => s + c.population, 0);
  const happy = counties.length ? Math.round(counties.reduce((s, c) => s + c.happiness, 0) / counties.length) : 0;
  const army = Object.values(state.armies).find((a) => a.ownerId === realmId);
  const where = army ? `${army.soldiers}men @${army.countyId ?? '—'}` : 'no army';
  return `${realm.name.padEnd(10)} ${pad(counties.length, 2)}co ${pad(pop, 5)}pop ${pad(happy, 3)}happy ` +
    `${pad(Math.round(realm.treasury.gold), 4)}g  ${where}`;
}

console.log('OpenLotR2 — AI rulers demo (Britain, 3 years)\n');
console.log('The human (p1) does nothing; the Baron (Scots) and Knight (Welsh) play.\n');

for (let i = 0; i < 12; i++) {
  const log = takeAiTurns(world);
  const report = advanceSeason(world, rng);

  console.log(`── Year ${report.year} ${report.season} ` + '─'.repeat(40));
  for (const id of ['p1', 'p2', 'p3']) console.log('  ' + realmLine(world, id));

  for (const r of log.realms) {
    const counts = r.commands.reduce<Record<string, number>>((m, c) => {
      m[c.type] = (m[c.type] ?? 0) + 1; return m;
    }, {});
    const summary = Object.entries(counts).map(([t, n]) => `${t}×${n}`).join(', ') || 'idle';
    const name = world.realms[r.realmId].name;
    const rej = r.rejected.length ? ` (${r.rejected.length} rejected)` : '';
    console.log(`    ${name}: ${summary}${rej}`);
  }
  console.log('');
}

console.log('Foraging pressure on enemy borders accumulates over the seasons above.');
