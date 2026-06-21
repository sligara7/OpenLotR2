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
import { isFerryLink } from '../game/maps/index.ts';
import { stateBus } from './state-bus.ts';
import type { Command } from '../game/commands/types.ts';
import type { County } from '../game/types/county.ts';
import type { GameState } from '../game/types/realm.ts';
import type { UnitType } from '../game/types/enums.ts';
import type { BattleResult } from '../game/systems/combat.ts';
import type { TurnReport } from '../game/engine.ts';

interface Capture { countyId: string; ownerId: string | null }

/** Notable, player-visible events from a turn → log lines. `captures` (counties
 *  that changed hands, e.g. AI conquests) come on the result, the rest from the
 *  report. */
function turnEvents(r: TurnReport, captures: Capture[], state: GameState): string[] {
  const cn = (id: string): string => state.counties[id]?.name ?? id;
  const rn = (id: string): string => state.realms[id]?.name ?? id;
  const ev: string[] = [];
  for (const cap of captures) {
    ev.push(cap.ownerId ? `${rn(cap.ownerId)} took ${cn(cap.countyId)}` : `${cn(cap.countyId)} broke free`);
  }
  // Siege detail beyond the bare capture (captures already cover stormed/starved).
  for (const s of r.siege.sieges) {
    if (s.status === 'repulsed') ev.push(`assault on ${cn(s.countyId)} was repulsed`);
  }
  for (const c of r.convoys.convoys) {
    if (c.status === 'delivered') ev.push(`${rn(c.ownerId)} resupplied an army`);
    else if (c.status === 'intercepted') ev.push(`${rn(c.ownerId)}'s convoy was intercepted!`);
    else if (c.status === 'lost') ev.push(`${rn(c.ownerId)}'s convoy was lost`);
  }
  for (const w of r.wages.realms) if (w.deserted > 0) ev.push(`${rn(w.realmId)} lost ${w.deserted} to desertion`);
  for (const c of r.counties) {
    if (c.plague) ev.push(`plague struck ${cn(c.countyId)}`);
    if (c.revoltTriggered) ev.push(`${cn(c.countyId)} rose in revolt`);
  }
  return ev;
}

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
  hud.showOutcome(state.outcome, meId, (id) => state.realms[id]?.name ?? id);
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

  if (selected && clicked && selected.ownerId === meId && selected.id !== clicked.id) {
    // Click an enemy → attack; click another of MY armies on the same tile → combine.
    if (clicked.ownerId !== meId) { void attack(selected.id, clicked.id); return; }
    if (clicked.col === selected.col && clicked.row === selected.row) { void combine(selected.id, clicked.id); return; }
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

/** Merge one of my armies into another that shares its tile. */
async function combine(intoArmyId: string, fromArmyId: string): Promise<void> {
  const result = await api.sendCommand(gameId, { type: 'CombineArmy', armyId: fromArmyId, intoArmyId }, meId);
  hud.setStatus(result.ok ? 'Armies combined.' : `Rejected: ${result.error ?? 'unknown'}`);
  publish(await api.getState(gameId)); // selection stays on intoArmyId, which lives on
}

/** Disband the selected army (its troops and weapons go home). */
export function disband(): void {
  if (!selectedArmyId) { hud.setStatus('Select one of your armies first.'); return; }
  void act({ type: 'DisbandArmy', armyId: selectedArmyId });
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

/** Hire a self-armed mercenary band of `unit` at a county. */
export function hire(countyId: string, unit: UnitType): void {
  void act({ type: 'HireMercenaries', countyId, unit, count: MUSTER_BATCH });
}

/** Grain sent per supply convoy. */
const CONVOY_GRAIN = 100;

/** Dispatch a supply convoy from a county to the selected army. */
export function supplyArmy(countyId: string): void {
  if (!selectedArmyId) { hud.setStatus('Select one of your armies to supply first.'); return; }
  void act({ type: 'SendConvoy', fromCountyId: countyId, toArmyId: selectedArmyId, grainSacks: CONVOY_GRAIN });
}

/** A tile was clicked: march the selected army there, else select the county. */
export function tileClicked(countyId: string | null, col: number, row: number): void {
  if (selectedArmyId) {
    const army = stateBus.current?.armies[selectedArmyId];
    if (army) {
      // A sea-linked county is reached by ferry; everything else marches by land.
      if (countyId && army.countyId && countyId !== army.countyId && isFerryLink(army.countyId, countyId)) {
        void act({ type: 'FerryArmy', armyId: selectedArmyId, toCountyId: countyId });
      } else {
        mapView.previewPath(army.col, army.row, col, row, army.movement);
        void act({ type: 'MoveArmy', armyId: selectedArmyId, col, row });
      }
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
  const msg = result.ok ? `Applied ${command.type}.` : `Rejected: ${result.error ?? 'unknown'}`;
  const next = await api.getState(gameId);
  if (result.ok && command.type === 'EndTurn' && result.report) {
    const r = result.report;
    const captures = (result as { captures?: Capture[] }).captures ?? [];
    hud.logTurn(`Year ${r.year} · ${r.season} · turn ${r.turn}`, turnEvents(r, captures, next));
  }
  hud.setStatus(msg);
  publish(next);
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

/** Download the current game as a JSON save file. */
export async function saveGame(): Promise<void> {
  const save = await api.save(gameId);
  const s = stateBus.current;
  const name = s ? `kotl-y${s.year}-${s.season}-t${s.turn}.json` : 'kotl-save.json';
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  hud.setStatus(`Saved ${name}.`);
}

/** Load a save file the player chose, switching to the restored game. */
export async function loadGame(file: File): Promise<void> {
  let save: unknown;
  try { save = JSON.parse(await file.text()); } catch { hud.setStatus('That is not a valid save file.'); return; }
  const res = await api.load(save);
  if (!res?.gameId) { hud.setStatus('Could not load that save.'); return; }
  gameId = res.gameId;
  selectedId = null;
  selectedArmyId = null;
  mapView.setSelectedArmy(null);
  publish(res.state);
  hud.setStatus(`Loaded — year ${res.state.year}, turn ${res.state.turn}.`);
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
    onSave: () => void saveGame(),
    onLoad: (file) => void loadGame(file),
    onSiege: () => laySiege(),
    onDisband: () => disband(),
    onBlacksmith: (countyId, product) => setBlacksmith(countyId, product),
    onMuster: (countyId, unit) => muster(countyId, unit),
    onHire: (countyId, unit) => hire(countyId, unit),
    onSupply: (countyId) => supplyArmy(countyId),
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
