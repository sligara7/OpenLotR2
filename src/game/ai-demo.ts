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
  // Compact composition, e.g. "40men[P16 A8 Sw8 M4 Kn4]".
  const abbr: Record<string, string> = { Peasant: 'P', Maceman: 'M', Pikeman: 'Pk', Archer: 'A', Crossbowman: 'X', Swordsman: 'Sw', Knight: 'Kn' };
  const comp = army ? Object.entries(army.units).filter(([, n]) => n > 0).map(([t, n]) => `${abbr[t]}${n}`).join(' ') : '';
  const where = army ? `${army.soldiers}men[${comp}] @${army.countyId ?? '—'}` : 'no army';
  return `${realm.name.padEnd(10)} ${pad(counties.length, 2)}co ${pad(pop, 5)}pop ${pad(happy, 3)}happy ` +
    `${pad(Math.round(realm.treasury.gold), 4)}g  ${where}`;
}

console.log('King of the Lands — AI rulers demo (Britain, 3 years)\n');
console.log('The human (p1) does nothing; the Baron (Scots) and Knight (Welsh) play.\n');

for (let i = 0; i < 24; i++) {
  const log = takeAiTurns(world, rng);
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
  // Surface any active sieges and their outcomes this season.
  for (const s of report.siege.sieges) {
    const county = world.counties[s.countyId]?.name ?? s.countyId;
    const who = world.realms[s.attackerRealmId]?.name ?? s.attackerRealmId;
    console.log(`    ⚔ ${who} besieging ${county}: ${s.status} ` +
      `(progress ${(s.progress * 100) | 0}%, garrison ${s.garrison})`);
  }
  console.log('');
}

console.log('Foraging pressure on enemy borders accumulates over the seasons above.');
