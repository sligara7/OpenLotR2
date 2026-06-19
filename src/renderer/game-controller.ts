/*
 * Game controller — owns the API loop, the current selection, and the DOM HUD.
 *
 * Player actions (per-county and bulk-across-the-realm) flow through the command
 * protocol to the authoritative server; the refreshed state is then published to
 * every view (HUD + canvas map). Decoupled from Phaser so the UI works even when
 * the canvas renderer can't initialize.
 */

import { api } from './services/api.ts';
import { Hud, cycleRation, type ControlKind } from './ui/hud.ts';
import { MapTilesSvg } from './ui/map-tiles-svg.ts';
import { stateBus } from './state-bus.ts';
import type { Command } from '../game/commands/types.ts';
import type { County } from '../game/types/county.ts';
import type { GameState } from '../game/types/realm.ts';

let gameId = '';
let hud: Hud;
let selectedId: string | null = null;
let meId = 'p1';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function humanId(state: GameState): string {
  return Object.values(state.realms).find((r) => r.isHuman)?.id ?? 'p1';
}

function refreshSelected(): void {
  const state = stateBus.current;
  hud.showSelected(selectedId && state ? state.counties[selectedId] ?? null : null);
}

/** Push new state to the HUD, the views (map), and the selected-county panel. */
function publish(state: GameState): void {
  meId = humanId(state);
  hud.render(state, meId);
  stateBus.publish(state);
  refreshSelected();
}

export function selectCounty(countyId: string): void {
  selectedId = countyId;
  refreshSelected();
  const county = stateBus.current?.counties[countyId];
  if (county) hud.setStatus(`Selected ${county.name}.`);
}

/** Translate a UI control nudge into a command for a county. */
function buildCommand(county: County, kind: ControlKind, delta: number): Command {
  switch (kind) {
    case 'tax':
      return { type: 'SetTaxRate', countyId: county.id, rate: clamp(county.taxRate + delta, 0, 100) };
    case 'ration':
      return { type: 'SetRation', countyId: county.id, level: cycleRation(county.wantedRation, delta) };
    case 'industry':
      return { type: 'SetLabourPolicy', countyId: county.id, industryShare: clamp(county.labour.industryShare + delta, 0, 1) };
    case 'diet':
      return { type: 'SetLabourPolicy', countyId: county.id, grainBeefBalance: clamp(county.labour.grainBeefBalance + delta, 0, 1) };
  }
}

async function act(command: Command): Promise<void> {
  const result = await api.sendCommand(gameId, command, meId);
  hud.setStatus(result.ok ? `Applied ${command.type}.` : `Rejected: ${result.error ?? 'unknown'}`);
  publish(await api.getState(gameId));
}

/** Apply a batch of commands, then refresh once. */
async function actMany(commands: Command[], label: string): Promise<void> {
  if (commands.length === 0) {
    hud.setStatus('No counties to update.');
    return;
  }
  for (const command of commands) await api.sendCommand(gameId, command, meId);
  hud.setStatus(`${label}: applied to ${commands.length} counties.`);
  publish(await api.getState(gameId));
}

export async function startGameUI(): Promise<void> {
  hud = new Hud({
    onEndTurn: () => void act({ type: 'EndTurn' }),
    onSelect: (id) => selectCounty(id),
    onCommand: (id, kind, delta) => {
      const county = stateBus.current?.counties[id];
      if (county) void act(buildCommand(county, kind, delta));
    },
    onBulk: (kind, delta) => {
      const state = stateBus.current;
      if (!state) return;
      const owned = Object.values(state.counties).filter((c) => c.ownerId === meId);
      void actMany(owned.map((c) => buildCommand(c, kind, delta)), `All ${kind}`);
    },
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
