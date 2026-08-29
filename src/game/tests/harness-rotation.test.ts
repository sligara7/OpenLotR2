/*
 * Every seat must play every temperament.
 *
 * ⚠️ THIS PINS A DEFECT IN THE INSTRUMENT, NOT IN THE GAME, which is why it is
 * worth a test of its own: a confounded harness reports confident numbers and
 * nothing looks wrong. Until 2026-08-29 only the human's seat drew a rotating
 * personality and the roster supplied the rest, so p2 was ALWAYS the Baron and
 * p3 ALWAYS the Knight. Temperament and starting position were therefore the
 * same variable, and every "by temperament" figure the harness had ever printed
 * was a statement about a seat wearing a personality's name:
 *
 *   "the Baron wins 75% of decided games"  and  "seat p2 wins 62%"
 *   "the Knight never wins"                and  "Wales is unplayable"
 *
 * were each one fact reported twice, with nothing saying so.
 *
 * Once the seats were rotated, both effects turned out to be real and to
 * compound: seat p1 took 35 of 57 decided games (P < 1e-4) against p3's 1,
 * while the Baron took 24 (P = 0.0035) against the Knight's 3. Holding the seat
 * fixed and rotating only temperament: Baron 68%, Bishop 36%, Countess 24%,
 * Knight 12%. See the root-cause analysis for the full working.
 */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { playGame } from '../balance/play.ts';
import { NoblePersonality } from '../types/enums.ts';

/**
 * Which personality each seat drew, over a run of consecutive seeds.
 *
 * Read off a real (short) run rather than from the rotation formula, so the
 * test breaks if the ASSIGNMENT changes however it is computed.
 */
function seatDraws(games: number): Map<string, Map<string, number>> {
  const draws = new Map<string, Map<string, number>>();
  for (let i = 0; i < games; i += 1) {
    // One turn is enough: the personalities are assigned before the first.
    const result = playGame({ seed: 1268 + i, maxTurns: 1 });
    for (const realm of result.realms) {
      const seat = draws.get(realm.realmId) ?? new Map<string, number>();
      const p = realm.personality ?? '—';
      seat.set(p, (seat.get(p) ?? 0) + 1);
      draws.set(realm.realmId, seat);
    }
  }
  return draws;
}

test('harness: every seat draws every temperament, equally often', () => {
  const personalities = Object.values(NoblePersonality).length;
  const games = personalities * 5; // a whole number of rotations
  const draws = seatDraws(games);

  assert(draws.size >= 2, 'more than one seat is being measured');

  for (const [seat, counts] of draws) {
    assertEqual(
      counts.size,
      personalities,
      `seat ${seat} only ever played ${counts.size} of ${personalities} temperaments `
        + `(${[...counts.keys()].join(', ')}) — temperament and position are the same variable`,
    );
    for (const [p, n] of counts) {
      assertEqual(
        n,
        games / personalities,
        `seat ${seat} played ${p} ${n} times in ${games} games, expected ${games / personalities}`,
      );
    }
  }
});

test('harness: no temperament is tied to one seat', () => {
  // The inverse reading of the same property, and the one that states the
  // failure in the words it actually appeared in — "the Baron" turning out to
  // mean "whoever sits in Scotland".
  const games = Object.values(NoblePersonality).length * 5;
  const bySeat = seatDraws(games);

  const seatsFor = new Map<string, Set<string>>();
  for (const [seat, counts] of bySeat) {
    for (const p of counts.keys()) {
      const seats = seatsFor.get(p) ?? new Set<string>();
      seats.add(seat);
      seatsFor.set(p, seats);
    }
  }

  for (const [p, seats] of seatsFor) {
    assert(
      seats.size === bySeat.size,
      `${p} only ever appears in seat(s) ${[...seats].join(', ')} of ${bySeat.size} — `
        + `a win attributed to this temperament cannot be told from a win attributed to that seat`,
    );
  }
});
