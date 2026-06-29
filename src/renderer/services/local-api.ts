/*
 * In-process backend — the simulation core running inside the browser/WebView.
 *
 * Exposes the SAME shape as the HTTP client in ./api.ts, so the game controller
 * is agnostic about where the rules run. Here there is no server: commands are
 * dispatched directly against an in-memory GameState, exactly as the Express
 * routes do (see src/server/routes/games.ts and src/server/store.ts), which is
 * the port of record for this logic.
 *
 * This is what lets the game run fully offline — e.g. packaged as a mobile APK
 * with no network — since the core is pure, deterministic TypeScript.
 *
 * State survives page reloads via a single localStorage autosave slot.
 */

import {
  createDemoWorld,
  createBritainWorld,
  createRng,
  dispatch,
  takeAiTurns,
} from '../../game/index.ts';
import type { GameState, GameSetup } from '../../game/index.ts';
import type { Command, CommandResult } from '../../game/commands/types.ts';
import type { Rng } from '../../game/rng.ts';
import type { TurnReport } from '../../game/engine.ts';
import type { CreatedGame } from './api.ts';

interface Game {
  id: string;
  seed: number;
  state: GameState;
  rng: Rng;
  reports: TurnReport[];
}

/** Self-contained, serialisable save: GameState + the RNG state to resume
 *  deterministically. Mirrors SaveGame in src/server/store.ts. */
interface SaveGame {
  version: number;
  seed: number;
  rng: number;
  state: GameState;
}

const SAVE_VERSION = 1;
const AUTOSAVE_KEY = 'kotl:autosave';

const games = new Map<string, Game>();
let counter = 0;
/** Which game the autosave slot tracks (the one the player is in). */
let activeId = '';

function nextId(): string {
  counter += 1;
  return `g${counter}`;
}

/** Persist the active game to localStorage so a reload can resume it. Failures
 *  (private mode, quota) are non-fatal — play simply won't survive a reload. */
function autosave(id: string): void {
  activeId = id;
  const blob = snapshot(id);
  if (!blob) return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(blob));
  } catch {
    /* storage unavailable — ignore */
  }
}

function snapshot(id: string): SaveGame | undefined {
  const game = games.get(id);
  if (!game) return undefined;
  return { version: SAVE_VERSION, seed: game.seed, rng: game.rng.state(), state: game.state };
}

function loadBlob(save: SaveGame): Game {
  const game: Game = {
    id: nextId(),
    seed: save.seed,
    state: save.state,
    rng: createRng(save.rng),
    reports: [],
  };
  games.set(game.id, game);
  return game;
}

export const api = {
  async createGame(
    seed = 1,
    scenario: 'demo' | 'britain' = 'demo',
    setup?: GameSetup,
  ): Promise<CreatedGame> {
    const state = scenario === 'britain' ? createBritainWorld(setup) : createDemoWorld(setup);
    const game: Game = { id: nextId(), seed, state, rng: createRng(seed), reports: [] };
    games.set(game.id, game);
    autosave(game.id);
    return { gameId: game.id, seed: game.seed, state: game.state };
  },

  async getState(id: string): Promise<GameState> {
    const game = games.get(id);
    if (!game) throw new Error(`No such game: ${id}`);
    return game.state;
  },

  async sendCommand(id: string, command: Command, realmId = 'p1'): Promise<CommandResult> {
    const game = games.get(id);
    if (!game) throw new Error(`No such game: ${id}`);

    const isEndTurn = command.type === 'EndTurn';
    // Snapshot county ownership + the diplomatic ledger so we can report what
    // changed hands and how relations shifted across the turn. (Mirrors the
    // server route in src/server/routes/games.ts.)
    const owners = isEndTurn
      ? new Map(Object.values(game.state.counties).map((c) => [c.id, c.ownerId]))
      : null;
    const alliancesBefore = isEndTurn ? new Set(Object.keys(game.state.diplomacy.alliances)) : null;
    const enemiesBefore = isEndTurn ? new Set(Object.keys(game.state.diplomacy.enemies)) : null;

    // Single-host turn order: when the human ends the turn, the AI rulers take
    // theirs first (through the same dispatcher), then the world ticks once.
    if (isEndTurn) takeAiTurns(game.state, game.rng);
    const result = dispatch(game.state, command, { actorRealmId: realmId, rng: game.rng });
    if (result.report) game.reports.push(result.report);
    autosave(id);

    if (owners && alliancesBefore && enemiesBefore) {
      const captures: { countyId: string; ownerId: string | null }[] = [];
      for (const c of Object.values(game.state.counties)) {
        if (owners.get(c.id) !== c.ownerId) captures.push({ countyId: c.id, ownerId: c.ownerId });
      }
      const allianceKeys = Object.keys(game.state.diplomacy.alliances);
      const enemyKeys = Object.keys(game.state.diplomacy.enemies);
      const diplomacy = {
        newAlliances: allianceKeys.filter((k) => !alliancesBefore.has(k)),
        brokenAlliances: [...alliancesBefore].filter((k) => !game.state.diplomacy.alliances[k]),
        newEnemies: enemyKeys.filter((k) => !enemiesBefore.has(k)),
      };
      return { ...result, captures, diplomacy };
    }
    return result;
  },

  /** Snapshot the active game as a portable save blob (for file download). */
  async save(id: string): Promise<unknown> {
    const blob = snapshot(id);
    if (!blob) throw new Error(`No such game: ${id}`);
    return blob;
  },

  /** Load a save blob as a new game (resumes the exact RNG sequence). */
  async load(save: unknown): Promise<CreatedGame> {
    const game = loadBlob(save as SaveGame);
    autosave(game.id);
    return { gameId: game.id, seed: game.seed, state: game.state };
  },

  /** Resume the autosaved game from a previous session, or null if none. */
  async resume(): Promise<CreatedGame | null> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(AUTOSAVE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const blob = JSON.parse(raw) as SaveGame;
      if (blob.version !== SAVE_VERSION) return null;
      const game = loadBlob(blob);
      activeId = game.id;
      return { gameId: game.id, seed: game.seed, state: game.state };
    } catch {
      return null;
    }
  },

  /** Discard the autosave (e.g. when the player starts a fresh game). */
  clearAutosave(): void {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* ignore */
    }
  },
};
