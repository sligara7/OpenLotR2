/*
 * Game controller — owns the API-driven control loop and the DOM HUD.
 *
 * Deliberately independent of Phaser: the HUD mounts and the game runs even if
 * the canvas renderer is unavailable (e.g. headless browsers in CI). Phaser
 * handles visuals; this handles state + player actions.
 */

import { api } from './services/api.ts';
import { Hud } from './ui/hud.ts';
import { MapSvg } from './ui/map-svg.ts';
import { stateBus } from './state-bus.ts';
import type { Command } from '../game/commands/types.ts';
import type { GameState } from '../game/types/realm.ts';

let gameId = '';
let hud: Hud;

/** Push new state to both the HUD and any subscribed views (the canvas map). */
function publish(state: GameState): void {
  hud.render(state);
  stateBus.publish(state);
}

async function act(command: Command): Promise<void> {
  const result = await api.sendCommand(gameId, command);
  hud.setStatus(result.ok ? `Applied ${command.type}.` : `Rejected: ${result.error ?? 'unknown'}`);
  publish(await api.getState(gameId));
}

async function adjustTax(countyId: string, delta: number): Promise<void> {
  const state = await api.getState(gameId);
  const current = state.counties[countyId]?.taxRate ?? 0;
  const rate = Math.max(0, Math.min(100, current + delta));
  await act({ type: 'SetTaxRate', countyId, rate });
}

/** Show a county's details in the HUD status (used by the map's click handler). */
export function selectCounty(countyId: string): void {
  const state = stateBus.current;
  const county = state?.counties[countyId];
  if (!county) return;
  hud.setStatus(
    `${county.name} — ${county.ownerId ?? 'unowned'} · pop ${county.population} · ` +
    `happy ${Math.round(county.happiness)} · ${county.healthLabel} · tax ${county.taxRate}%`,
  );
}

export async function startGameUI(): Promise<void> {
  hud = new Hud({
    onEndTurn: () => void act({ type: 'EndTurn' }),
    onAdjustTax: (countyId, delta) => void adjustTax(countyId, delta),
  });
  new MapSvg().mount(); // SVG county map; subscribes to the state bus itself
  hud.mount();
  hud.setStatus('Creating game…');

  const { gameId: id, state } = await api.createGame(1, 'britain');
  gameId = id;
  publish(state);
  hud.setStatus(`Game ${id} ready.`);
  (window as unknown as { __olr?: unknown }).__olr = { gameId: id };
}
