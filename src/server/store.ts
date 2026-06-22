/*
 * In-memory game store.
 *
 * Holds each live game's authoritative GameState plus the seed and RNG used to
 * advance it deterministically. One process, one Map — fine for development and
 * single-host play.
 *
 * FUTURE: persist to disk (nedb is already a dependency) and add per-game
 * concurrency control once multiple clients hit the same game.
 */

import { createDemoWorld, createBritainWorld } from '../game/index.ts';
import { createRng } from '../game/rng.ts';
import type { GameSetup } from '../game/index.ts';
import type { GameState } from '../game/types/realm.ts';
import type { Rng } from '../game/rng.ts';
import type { TurnReport } from '../game/engine.ts';

export interface Game {
  id: string;
  seed: number;
  state: GameState;
  rng: Rng;
  /** Per-turn reports accumulated as the game advances (one per EndTurn). */
  reports: TurnReport[];
}

/** A self-contained, serialisable save: the plain GameState plus the RNG state
 *  needed to resume deterministically. (Turn-report history is not saved.) */
export interface SaveGame {
  version: number;
  seed: number;
  /** The RNG's internal state at save time (see Rng.state()). */
  rng: number;
  state: GameState;
}

export const SAVE_VERSION = 1;

export class GameStore {
  private games = new Map<string, Game>();
  private counter = 0;

  /** Deterministic id generator (no Date.now/Math.random in the core path). */
  private nextId(): string {
    this.counter += 1;
    return `g${this.counter}`;
  }

  create(seed: number, scenario: 'demo' | 'britain' = 'demo', setup?: GameSetup): Game {
    const state = scenario === 'britain' ? createBritainWorld(setup) : createDemoWorld(setup);
    const game: Game = {
      id: this.nextId(),
      seed,
      state,
      rng: createRng(seed),
      reports: [],
    };
    this.games.set(game.id, game);
    return game;
  }

  get(id: string): Game | undefined {
    return this.games.get(id);
  }

  has(id: string): boolean {
    return this.games.has(id);
  }

  /** Snapshot a game as a portable save blob, or undefined if no such game. */
  save(id: string): SaveGame | undefined {
    const game = this.games.get(id);
    if (!game) return undefined;
    return { version: SAVE_VERSION, seed: game.seed, rng: game.rng.state(), state: game.state };
  }

  /** Load a save blob as a brand-new game (resumes the exact RNG sequence). */
  load(save: SaveGame): Game {
    const game: Game = {
      id: this.nextId(),
      seed: save.seed,
      state: save.state,
      rng: createRng(save.rng),
      reports: [],
    };
    this.games.set(game.id, game);
    return game;
  }
}
