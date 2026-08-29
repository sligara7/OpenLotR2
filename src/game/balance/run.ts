/*
 * The balance harness — run it and read what the rules actually do.
 *
 *   npm run balance                     20 games, 500-turn cap
 *   npm run balance -- --games 100      more samples, tighter numbers
 *   npm run balance -- --turns 200      the old fifty-year cap
 *   npm run balance -- --nobles 5       a crowded map
 *   npm run balance -- --aggression 2   push the AI
 *   npm run balance -- --json out.json  machine-readable, for comparing runs
 *
 * Games are seeded from a fixed base, so the same flags always play the same
 * games. That is the whole point: change the DESIGN, re-run, and any number
 * that moved was moved by the change rather than by luck.
 */

import { writeFileSync } from 'node:fs';

import { playGame } from './play.ts';
import { formatReport } from './report.ts';
import type { GameResult } from './measures.ts';
import type { GameSetup } from '../scenarios.ts';

/** Fixed base seed: same flags, same games, every time. */
const BASE_SEED = 1268;

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function stringFlag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const games = flag('games', 20);
// 500 turns is 125 game years. The cap was 200 (fifty years) until 2026-08-28,
// when making all four rulers actually competitive turned out to make games
// HARDER to resolve — a contested map takes longer to settle than a walkover.
// Measured on the same twenty seeds: 1/20 games reached a decision inside 200
// turns and 5/20 inside 500, resolving between turns 151 and 409. A cap that
// most games cannot reach measures the cap rather than the design.
//
// ⚠️ BASELINES ACROSS THIS CHANGE ARE NOT COMPARABLE. Every balance figure
// recorded before this date was taken at 200 turns; pass `--turns 200` to
// reproduce one.
const maxTurns = flag('turns', 500);
const nobles = flag('nobles', 3);
const aggression = flag('aggression', 1);
const jsonOut = stringFlag('json');

const setup: GameSetup = { nobles, aiAggression: aggression };

process.stdout.write(
  `playing ${games} games (${nobles} nobles, aggression ${aggression}, cap ${maxTurns} turns)…\n`,
);

const results: GameResult[] = [];
const started = process.hrtime.bigint();
for (let i = 0; i < games; i++) {
  results.push(playGame({ seed: BASE_SEED + i, maxTurns, setup }));
  // A progress line, because a hundred games is not instant.
  process.stdout.write(`\r  ${i + 1}/${games}`);
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
process.stdout.write(`\r  ${games}/${games} in ${(elapsedMs / 1000).toFixed(1)}s\n`);

process.stdout.write(formatReport(results, maxTurns));

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ games, maxTurns, nobles, aggression, results }, null, 1));
  process.stdout.write(`written to ${jsonOut}\n`);
}
