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

/** Personalities handed to the seat a human would otherwise hold, cycled by
 *  seed so no single temperament is over-represented in the sample. */
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

  // Hand the human's seat to the AI as well, so every realm is played.
  const human = Object.values(state.realms).find((r) => r.isHuman);
  if (human) {
    human.isHuman = false;
    human.personality = SEATS[seed % SEATS.length];
  }

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
