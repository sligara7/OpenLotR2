/*
 * Game controller — owns the API loop, the current selection, and the DOM HUD.
 *
 * Player actions (tax, rations, labour split, diet, end turn) flow through the
 * command protocol to the authoritative server, then the refreshed state is
 * published to every view (HUD + canvas map). Decoupled from Phaser so the UI
 * works even when the canvas renderer can't initialize.
 */

import { api } from './services/api.ts';
import { Hud, cycleRation } from './ui/hud.ts';
import { MapTilesSvg } from './ui/map-tiles-svg.ts';
import { stateBus } from './state-bus.ts';
import type { Command } from '../game/commands/types.ts';
import type { County } from '../game/types/county.ts';
import type { GameState } from '../game/types/realm.ts';

let gameId = '';
let hud: Hud;
let selectedId: string | null = null;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function refreshSelected(): void {
  const state = stateBus.current;
  hud.showSelected(selectedId && state ? state.counties[selectedId] ?? null : null);
}

/** Push new state to the HUD, the views (map), and the selected-county panel. */
function publish(state: GameState): void {
  hud.render(state);
  stateBus.publish(state);
  refreshSelected();
}

/** Select a county (from the map or the HUD list) and show its controls. */
export function selectCounty(countyId: string): void {
  selectedId = countyId;
  refreshSelected();
  const county = stateBus.current?.counties[countyId];
  if (county) hud.setStatus(`Selected ${county.name}.`);
}

async function act(command: Command): Promise<void> {
  const result = await api.sendCommand(gameId, command);
  hud.setStatus(result.ok ? `Applied ${command.type}.` : `Rejected: ${result.error ?? 'unknown'}`);
  publish(await api.getState(gameId));
}

/** Build and dispatch a command for the currently-selected county. */
function withSelected(build: (county: County) => Command | null): void {
  const state = stateBus.current;
  const county = selectedId && state ? state.counties[selectedId] : null;
  if (!county) {
    hud.setStatus('Select a county first.');
    return;
  }
  const command = build(county);
  if (command) void act(command);
}

export async function startGameUI(): Promise<void> {
  hud = new Hud({
    onEndTurn: () => void act({ type: 'EndTurn' }),
    onSelect: (id) => selectCounty(id),
    onTax: (d) => withSelected((c) => ({ type: 'SetTaxRate', countyId: c.id, rate: clamp(c.taxRate + d, 0, 100) })),
    onRation: (d) => withSelected((c) => ({ type: 'SetRation', countyId: c.id, level: cycleRation(c.wantedRation, d) })),
    onIndustry: (d) =>
      withSelected((c) => ({ type: 'SetLabourPolicy', countyId: c.id, industryShare: clamp(c.labour.industryShare + d, 0, 1) })),
    onDiet: (d) =>
      withSelected((c) => ({ type: 'SetLabourPolicy', countyId: c.id, grainBeefBalance: clamp(c.labour.grainBeefBalance + d, 0, 1) })),
  });
  new MapTilesSvg().mount(); // canvas-free SVG map; subscribes to the state bus
  hud.mount();
  hud.setStatus('Creating game…');

  const { gameId: id, state } = await api.createGame(1, 'britain');
  gameId = id;
  publish(state);
  hud.setStatus(`Game ${id} ready.`);
  (window as unknown as { __olr?: unknown }).__olr = { gameId: id };
}
