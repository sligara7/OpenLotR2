/*
 * Turn many played games into a page somebody will actually read.
 *
 * The report is shaped around the questions the design keeps asking and cannot
 * answer, in the order they matter:
 *
 *   1. Does the game END? An undecided game is the loudest possible finding.
 *   2. Is it OVER before it ends? A winner who led from year two is a game that
 *      stopped being a contest long before it stopped being played.
 *   3. Is any seat or temperament FAVOURED? Win rates say whether the map or the
 *      personalities are lopsided.
 *   4. Does the economy have a CEILING? Goods stuck at the glut floor, and a
 *      hoard nothing can be spent on.
 *   5. What did the seasons do to PEOPLE? Famine, revolt, desertion.
 *
 * Everything is printed with its spread, not just its middle, because a median
 * that looks healthy over a set of games that half ran away and half stalled is
 * the most misleading number the harness could produce.
 */

import type { GameResult } from './measures.ts';

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;
const pad = (s: string | number, n: number): string => String(s).padStart(n);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** A middle plus the range, because the spread is usually the story. */
function spread(values: number[]): string {
  if (values.length === 0) return '—';
  return `${median(values)} (${Math.min(...values)}–${Math.max(...values)})`;
}

export function formatReport(results: GameResult[], maxTurns: number): string {
  const out: string[] = [];
  const n = results.length;
  const decided = results.filter((r) => r.decided);
  const undecided = results.filter((r) => !r.decided);

  out.push('');
  out.push('═'.repeat(64));
  out.push(`  BALANCE — ${n} games, cap ${maxTurns} turns (${(maxTurns / 4).toFixed(0)} years)`);
  out.push('═'.repeat(64));

  // --- 1. Does it end? ------------------------------------------------------
  out.push('');
  out.push('DECISIVENESS');
  out.push(`  reached a decision   ${pad(decided.length, 4)} / ${n}   ${pct(decided.length / n)}`);
  if (decided.length) {
    out.push(`  turns to decide      ${spread(decided.map((r) => r.turns))}`);
    const byReason = new Map<string, number>();
    for (const r of decided) byReason.set(r.reason!, (byReason.get(r.reason!) ?? 0) + 1);
    out.push(`  how they ended       ${[...byReason].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  if (undecided.length) {
    const share = undecided.map((r) => r.topShare);
    out.push(`  ⚠ undecided games    ${undecided.length}: leader held ${pct(median(share))} of the map at the cap`);
  }

  // --- 2. Was it over early? ------------------------------------------------
  const led = decided.filter((r) => r.leadTakenAt >= 0);
  if (led.length) {
    out.push('');
    out.push('WAS IT A CONTEST?');
    const early = led.map((r) => r.leadTakenAt / Math.max(1, r.turns));
    out.push(`  winner took the lead ${spread(led.map((r) => r.leadTakenAt))} (turn)`);
    out.push(`  ...that is           ${pct(median(early))} of the way through the game`);
    if (median(early) < 0.25) {
      out.push('  ⚠ the eventual winner is usually ahead by the first quarter — little comeback');
    }
  }

  // --- 3. Is anyone favoured? ----------------------------------------------
  out.push('');
  out.push('WHO WINS');
  const bySeat = new Map<string, number>();
  const byPersona = new Map<string, number>();
  for (const r of decided) {
    if (!r.winnerId) continue;
    bySeat.set(r.winnerId, (bySeat.get(r.winnerId) ?? 0) + 1);
    const p = r.winnerPersonality ?? '—';
    byPersona.set(p, (byPersona.get(p) ?? 0) + 1);
  }
  const seats = [...bySeat].sort((a, b) => b[1] - a[1]);
  for (const [id, wins] of seats) {
    out.push(`  seat ${id.padEnd(4)}           ${pad(wins, 4)}   ${pct(wins / Math.max(1, decided.length))}`);
  }
  if (seats.length > 1) {
    const top = seats[0][1] / Math.max(1, decided.length);
    if (top > 0.5) out.push(`  ⚠ seat ${seats[0][0]} wins ${pct(top)} of decided games — the map may favour it`);
  }
  const personas = [...byPersona].sort((a, b) => b[1] - a[1]);
  if (personas.length) {
    out.push(`  by temperament       ${personas.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }

  // SEAT x TEMPERAMENT, because the two lines above are marginals and a
  // marginal hides exactly the thing that went wrong here. Until 2026-08-29 the
  // harness gave every seat a fixed personality, so "the Baron wins 75%" and
  // "seat p2 wins 62%" were one fact printed twice and neither line said so.
  // The seats are rotated now, which makes the marginals honest — but only the
  // cell shows whether a temperament is strong everywhere or strong in one
  // chair. Measured when this was added: Baron won 17 of 25 in the best seat
  // and 7 of 25 in the next, so the answer was "both, and they compound".
  const cell = new Map<string, number>();
  const played = new Map<string, number>();
  for (const r of results) {
    for (const realm of r.realms) {
      const key = `${realm.realmId}/${realm.personality ?? '—'}`;
      played.set(key, (played.get(key) ?? 0) + 1);
    }
    if (r.decided && r.winnerId) {
      const key = `${r.winnerId}/${r.winnerPersonality ?? '—'}`;
      cell.set(key, (cell.get(key) ?? 0) + 1);
    }
  }
  if (played.size > 1) {
    out.push('  seat x temperament   (wins / games played in that pairing)');
    for (const key of [...played.keys()].sort()) {
      const w = cell.get(key) ?? 0;
      const n = played.get(key) ?? 0;
      out.push(`    ${key.padEnd(20)} ${pad(w, 3)} / ${pad(n, 3)}   ${pct(w / Math.max(1, n))}`);
    }
  }

  // --- 4. Does the economy have a ceiling? ---------------------------------
  out.push('');
  out.push('ECONOMY');
  out.push(`  goods at glut floor  ${spread(results.map((r) => r.goodsAtFloor))} of 11`);
  out.push(`  goods at scarcity    ${spread(results.map((r) => r.goodsAtCeiling))} of 11`);
  out.push(`  leader's hoard       ${spread(results.map((r) => r.hoard))} (timber+stone+iron+wool)`);
  if (median(results.map((r) => r.goodsAtFloor)) >= 4) {
    out.push('  ⚠ most goods sit at the glut floor — production outruns every sink');
  }

  // --- 5. What happened to people? -----------------------------------------
  out.push('');
  out.push('THE SEASONS');
  out.push(`  hungry county-seasons ${spread(results.map((r) => r.hungrySeasons))}`);
  out.push(`  revolts              ${spread(results.map((r) => r.revolts))}`);
  out.push(`  plagues              ${spread(results.map((r) => r.plagues))}`);
  out.push(`  deserters            ${spread(results.map((r) => r.deserters))}`);
  const pressure = results.map((r) => Math.round(r.wagePressure * 100));
  out.push(`  wage bill / purse    ${spread(pressure)}%  (short paydays ${spread(results.map((r) => r.shortPaydays))})`);
  if (Math.max(...pressure) < 10) {
    out.push('  \u26a0 upkeep never bites — army size is limited by something other than money');
  }

  out.push('');
  out.push('WAR');
  out.push(`  sieges laid          ${spread(results.map((r) => r.siegesStarted))}`);
  out.push(`  sieges won           ${spread(results.map((r) => r.siegesWon))}`);
  out.push(`  sieges abandoned     ${spread(results.map((r) => r.siegesAbandoned))}`);
  out.push(`  assaults repulsed    ${spread(results.map((r) => r.assaultsRepulsed))}`);
  if (mean(results.map((r) => r.siegesStarted)) < 1) {
    out.push('  ⚠ sieges are almost never laid — castles may simply never be attacked');
  }

  out.push('');
  out.push('─'.repeat(64));
  out.push('  A moved number is evidence, not a verdict: every game here was');
  out.push('  played by the same AI, so this measures the RULES, not the feel.');
  out.push('─'.repeat(64));
  out.push('');
  return out.join('\n');
}
