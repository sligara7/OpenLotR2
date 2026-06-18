/*
 * Game controller — owns the API-driven control loop and the DOM HUD.
 *
 * Deliberately independent of Phaser: the HUD mounts and the game runs even if
 * the canvas renderer is unavailable (e.g. headless browsers in CI). Phaser
 * handles visuals; this handles state + player actions.
 */

import { api } from './services/api.ts';
import { Hud } from './ui/hud.ts';
import type { Command } from '../game/commands/types.ts';

let gameId = '';
let hud: Hud;

async function act(command: Command): Promise<void> {
  const result = await api.sendCommand(gameId, command);
  hud.setStatus(result.ok ? `Applied ${command.type}.` : `Rejected: ${result.error ?? 'unknown'}`);
  hud.render(await api.getState(gameId));
}

async function adjustTax(countyId: string, delta: number): Promise<void> {
  const state = await api.getState(gameId);
  const current = state.counties[countyId]?.taxRate ?? 0;
  const rate = Math.max(0, Math.min(100, current + delta));
  await act({ type: 'SetTaxRate', countyId, rate });
}

export async function startGameUI(): Promise<void> {
  hud = new Hud({
    onEndTurn: () => void act({ type: 'EndTurn' }),
    onAdjustTax: (countyId, delta) => void adjustTax(countyId, delta),
  });
  hud.mount();
  hud.setStatus('Creating game…');

  const { gameId: id, state } = await api.createGame(1);
  gameId = id;
  hud.render(state);
  hud.setStatus(`Game ${id} ready.`);
  (window as unknown as { __olr?: unknown }).__olr = { gameId: id };
}
