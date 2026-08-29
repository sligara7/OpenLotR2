/*
 * Play one whole game with nobody at the wheel.
 *
 * Every realm is driven by the AI, including the seat a human would normally
 * take. That is deliberate: comparing AI against AI holds the players constant
 * so that anything which moves between two runs came from the DESIGN, not from
 * how well somebody played. It is also the only way to run hundreds of games.
 *
 * ⚠️ AND IT IS THE HARNESS'S BIGGEST LIMITATION, stated here rather than buried:
 * a hundred seeds is a hundred samples of the same AI. These numbers say what
 * the RULES do when competent-ish rulers push on them. They say nothing about
 * what a person feels while playing, which is the thing ultimately in question.
 * Treat a moved number as evidence worth investigating, never as a verdict.
 */

import { advanceSeason } from '../engine.ts';
import { createRng } from '../rng.ts';
import { createBritainWorld } from '../scenarios.ts';
import { takeAiTurns } from '../ai/index.ts';
import { NoblePersonality } from '../types/enums.ts';
import { countiesOfRealm } from '../state/world.ts';
import type { GameSetup } from '../scenarios.ts';
import type { GameState } from '../types/realm.ts';
import {
  emptyTally,
  priceExtremes,
  realmResult,
  tallyTurn,
  type GameResult,
} from './measures.ts';

/**
 * Personalities handed to the seats, rotated by seed.
 *
 * ⚠️ EVERY SEAT IS ROTATED. Until 2026-08-29 only the human's seat was, and the
 * roster's own personalities stood for the rest — p2 was ALWAYS the Baron and p3
 * ALWAYS the Knight. That made temperament and starting position the same
 * variable, so every "by temperament" figure this harness ever produced was
 * really a statement about a SEAT wearing a personality's name: "the Baron wins
 * 75%" and "seat p2 wins 62%" were one fact reported twice, as were "the Knight
 * never wins" and "Wales is unplayable".
 *
 * Measured with the rotation in place, the two effects are separately real and
 * they compound: seat p1 takes 35 of 57 decided games (P < 1e-4) while p3 takes
 * 1, and the Baron takes 24 (P = 0.0035) while the Knight takes 3. Holding the
 * seat fixed and rotating only the temperament: Baron 68%, Bishop 36%, Countess
 * 24%, Knight 12%.
 *
 * With three seats and four temperaments one sits out each game; the rotation
 * gives every seat every personality an equal share of the time.
 */
const SEATS: readonly NoblePersonality[] = [
  NoblePersonality.Baron,
  NoblePersonality.Knight,
  NoblePersonality.Bishop,
  NoblePersonality.Countess,
];

export interface PlayOptions {
  seed: number;
  /** Give up after this many turns and record the game as undecided. */
  maxTurns: number;
  setup?: GameSetup;
}

/**
 * Play one game to its conclusion, or to the turn cap, and report what happened.
 *
 * The cap is not a failure of the harness — an UNDECIDED game is one of the most
 * important things this can find, so it is recorded as a result rather than
 * thrown away.
 */
export function playGame({ seed, maxTurns, setup }: PlayOptions): GameResult {
  const state: GameState = createBritainWorld(setup);
  const rng = createRng(seed);

  // Every realm is played by the AI, and every seat draws its temperament from
  // the rotation — including the one a human would hold. Sorted by id so the
  // assignment is deterministic and a seed always replays identically.
  Object.values(state.realms)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .forEach((realm, seat) => {
      realm.isHuman = false;
      realm.personality = SEATS[(seed + seat) % SEATS.length];
    });

  const tally = emptyTally();
  let turns = 0;

  while (turns < maxTurns && !state.outcome) {
    takeAiTurns(state, rng);
    const report = advanceSeason(state, rng);
    turns += 1;
    tallyTurn(tally, state, report);
  }

  const realms = Object.keys(state.realms).map((id) => realmResult(state, id));
  const totalCounties = Object.keys(state.counties).length;
  const topCounties = Math.max(...realms.map((r) => r.counties), 0);

  const winnerId = state.outcome?.winnerId ?? null;
  const winner = winnerId ? state.realms[winnerId] : null;
  const { floor, ceiling } = priceExtremes(state, winnerId ?? realms[0].realmId);
  const hoardRealm = winnerId ? state.realms[winnerId] : state.realms[realms[0].realmId];

  return {
    seed,
    decided: !!state.outcome,
    turns,
    winnerId,
    winnerPersonality: winner?.personality ?? null,
    reason: state.outcome?.reason ?? null,
    realms,
    topShare: totalCounties ? topCounties / totalCounties : 0,
    leadTakenAt: winnerId ? (tally.ledAt.get(winnerId) ?? -1) : -1,
    plagues: tally.plagues,
    revolts: tally.revolts,
    hungrySeasons: tally.hungrySeasons,
    deserters: Math.round(tally.deserters),
    wagePressure: tally.pursesAtPayday > 0 ? tally.wagesDue / tally.pursesAtPayday : 0,
    shortPaydays: tally.shortPaydays,
    siegesStarted: tally.siegesStarted,
    siegesWon: tally.siegesWon,
    siegesAbandoned: tally.siegesAbandoned,
    assaultsRepulsed: tally.assaultsRepulsed,
    goodsAtFloor: floor,
    goodsAtCeiling: ceiling,
    hoard: Math.round(
      hoardRealm.treasury.wood + hoardRealm.treasury.stone +
      hoardRealm.treasury.iron + hoardRealm.treasury.wool,
    ),
  };
}

/** Convenience for callers that just want to know who held what. */
export function mapShare(state: GameState, realmId: string): number {
  const total = Object.keys(state.counties).length;
  return total ? countiesOfRealm(state, realmId).length / total : 0;
}
