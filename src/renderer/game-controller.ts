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
import { composition } from './ui/units.ts';
import { stateBus } from './state-bus.ts';
import type { Command } from '../game/commands/types.ts';
import type { County } from '../game/types/county.ts';
import type { GameState } from '../game/types/realm.ts';
import type { UnitType } from '../game/types/enums.ts';
import type { BattleResult } from '../game/systems/combat.ts';

/** How many soldiers a single "Muster" raises (the minimum legal army size). */
const MUSTER_BATCH = 50;

let gameId = '';
let hud: Hud;
let mapView: MapTilesSvg;
let selectedId: string | null = null;
let selectedArmyId: string | null = null;
let meId = 'p1';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function humanId(state: GameState): string {
  return Object.values(state.realms).find((r) => r.isHuman)?.id ?? 'p1';
}

function refreshSelected(): void {
  const state = stateBus.current;
  hud.showSelected(selectedId && state ? state.counties[selectedId] ?? null : null);
}

/** Update the army panel from the current selection (army may have moved/died). */
function refreshArmy(): void {
  const state = stateBus.current;
  const army = selectedArmyId && state ? state.armies[selectedArmyId] ?? null : null;
  if (!army) { selectedArmyId = null; mapView.setSelectedArmy(null); }
  hud.showArmy(army, state ?? null, meId);
}

/** Push new state to the HUD, the views (map), and the selected panels. */
function publish(state: GameState): void {
  meId = humanId(state);
  hud.render(state, meId);
  stateBus.publish(state);
  refreshSelected();
  refreshArmy();
}

export function selectCounty(countyId: string): void {
  selectedId = countyId;
  refreshSelected();
  const county = stateBus.current?.counties[countyId];
  if (county) hud.setStatus(`Selected ${county.name}.`);
}

/** Click an army: if one of mine is already selected and this is an enemy,
 *  attack it; otherwise (de)select. */
export function armyClicked(armyId: string): void {
  const state = stateBus.current;
  if (!state) return;
  const clicked = state.armies[armyId];
  const selected = selectedArmyId ? state.armies[selectedArmyId] : null;

  if (selected && selected.ownerId === meId && clicked && clicked.ownerId !== meId) {
    void attack(selected.id, clicked.id);
    return;
  }

  selectedArmyId = selectedArmyId === armyId ? null : armyId;
  mapView.setSelectedArmy(selectedArmyId);
  const army = selectedArmyId ? clicked : null;
  hud.showArmy(army ?? null, state, meId);
  hud.setStatus(army
    ? `Army selected: ${army.soldiers} men [${composition(army)}] — click a tile to march, an enemy army to attack.`
    : 'Army deselected.');
}

/** Resolve a field battle and report the outcome. */
async function attack(armyId: string, targetArmyId: string): Promise<void> {
  const result = await api.sendCommand(gameId, { type: 'AttackArmy', armyId, targetArmyId }, meId);
  if (result.ok) {
    const b = (result.data as { battle?: BattleResult } | undefined)?.battle;
    if (b) {
      const won = b.winner === 'attacker';
      hud.setStatus(`Battle ${won ? 'WON' : 'LOST'} — you lost ${b.attacker.casualties}, ` +
        `enemy lost ${b.defender.casualties}.`);
    } else {
      hud.setStatus('Battle resolved.');
    }
  } else {
    hud.setStatus(`Attack rejected: ${result.error ?? 'unknown'}`);
  }
  publish(await api.getState(gameId));
}

/** Besiege the garrisoned castle the selected army occupies. */
export function laySiege(): void {
  const state = stateBus.current;
  const army = selectedArmyId && state ? state.armies[selectedArmyId] : null;
  if (!army || !army.countyId) { hud.setStatus('Select one of your armies on an enemy county first.'); return; }
  void act({ type: 'LaySiege', armyId: army.id, countyId: army.countyId });
}

/** Set which weapon a county's blacksmith forges (null = idle). */
export function setBlacksmith(countyId: string, product: UnitType | null): void {
  void act({ type: 'SetBlacksmith', countyId, product });
}

/** Muster a batch of `unit` from a county — reinforcing the selected army if it
 *  stands in the county, otherwise raising a fresh one at the town. */
export function muster(countyId: string, unit: UnitType): void {
  const state = stateBus.current;
  const army = selectedArmyId && state ? state.armies[selectedArmyId] : null;
  const armyId = army && army.ownerId === meId && army.countyId === countyId ? army.id : undefined;
  void act({ type: 'Conscript', countyId, unit, count: MUSTER_BATCH, armyId });
}

/** A tile was clicked: march the selected army there, else select the county. */
export function tileClicked(countyId: string | null, col: number, row: number): void {
  if (selectedArmyId) {
    const army = stateBus.current?.armies[selectedArmyId];
    if (army) {
      mapView.previewPath(army.col, army.row, col, row, army.movement);
      void act({ type: 'MoveArmy', armyId: selectedArmyId, col, row });
    }
    return;
  }
  if (countyId) selectCounty(countyId);
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
    onSiege: () => laySiege(),
    onBlacksmith: (countyId, product) => setBlacksmith(countyId, product),
    onMuster: (countyId, unit) => muster(countyId, unit),
  });
  mapView = new MapTilesSvg(); // canvas-free SVG map; subscribes to the state bus
  mapView.mount();
  hud.mount();
  hud.setStatus('Creating game…');

  const { gameId: id, state } = await api.createGame(1, 'britain');
  gameId = id;
  publish(state);
  hud.setStatus(`Game ${id} ready.`);
  (window as unknown as { __olr?: unknown }).__olr = { gameId: id };
}
