/*
 * Renderer-side API client.
 *
 * Talks to the backend REST API. Types are imported *type-only* from the
 * simulation core, so the client is fully typed but no game logic is bundled
 * into the browser. In dev, requests go to '/api' which Vite proxies to the
 * server (see vite.config.ts), avoiding CORS.
 */

import type { GameState } from '../../game/types/realm.ts';
import type { Command, CommandResult } from '../../game/commands/types.ts';

const BASE = '/api';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  return (await res.json()) as T;
}

export interface CreatedGame {
  gameId: string;
  seed: number;
  state: GameState;
}

export const api = {
  createGame: (seed?: number): Promise<CreatedGame> =>
    http('/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seed }),
    }),

  getState: (id: string): Promise<GameState> => http(`/games/${id}/state`),

  sendCommand: (id: string, command: Command, realmId = 'p1'): Promise<CommandResult> =>
    http(`/games/${id}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-realm-id': realmId },
      body: JSON.stringify(command),
    }),
};
