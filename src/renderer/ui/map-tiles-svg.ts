/*
 * SVG hex-tile map — a "living county" view.
 *
 * Layers (painted back to front):
 *   terrain  — hexes, tinted toward the owning realm
 *   farms    — DYNAMIC: crop patches on worked wheat tiles (coloured by the
 *              grain growth stage) and livestock on pasture tiles with cattle
 *   industry — STATIC icons on extractive tiles (forest, quarry, mine, fishery)
 *   labels   — clickable county names
 *   settle   — DYNAMIC: villages that appear/spread as population grows
 *
 * Pure SVG/DOM: crisp at any scale and Playwright-inspectable.
 */

import { buildBritainTileMap } from '../../game/maps/britain-tiles.ts';
import { BRITAIN } from '../../game/maps/britain.ts';
import { Terrain, TileResource, hexCentre, hexNeighbours, isPassable, type HexTile } from '../../game/maps/tiles.ts';
import { findTilePath } from '../../game/maps/movement.ts';
import { stateBus } from '../state-bus.ts';
import { selectCounty, tileClicked, armyClicked } from '../game-controller.ts';
import { CastleType, FieldStatus } from '../../game/types/enums.ts';
import type { County } from '../../game/types/county.ts';
import type { GameState } from '../../game/types/realm.ts';

const SVGNS = 'http://www.w3.org/2000/svg';
const S = 10;
const POP_PER_VILLAGE = 250;

const TERRAIN_FILL: Record<Terrain, string> = {
  Plains: '#6f8f3f', Forest: '#2f5a2a', Hills: '#9c8a52', Mountains: '#6f6f6f',
  Moor: '#7d6f8a', Coast: '#c9b87f', Water: '#27496b',
};
const OWNER_COLOR: Record<string, string> = { p1: '#3a6ea5', p2: '#a53a3a', p3: '#3aa55a' };

// Crop patch colours by grain stage.
const CROP_BARE = '#6e4a2a';     // ploughed / harvested
const CROP_GROWING = '#7fa83e';  // green, growing
const CROP_RIPE = '#d8b53c';     // golden, ready

type Pt = [number, number];

interface CountyView {
  spots: Pt[];     // passable inland tiles, nearest-to-centre first (villages)
  wheat: Pt[];     // wheat tiles (cultivated crop patches)
  pasture: Pt[];   // pasture tiles (livestock)
}

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function hexPoints(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + S * Math.cos(a)).toFixed(1)},${(cy + S * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function mix(hexA: string, hexB: string, t: number): string {
  const pa = parseInt(hexA.slice(1), 16);
  const pb = parseInt(hexB.slice(1), 16);
  const ch = (s: number) => {
    const a = (pa >> s) & 0xff;
    const b = (pb >> s) & 0xff;
    return Math.round(a + (b - a) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Colour for a county's wheat fields, reflecting where it is in the cycle. */
function grainColour(county: County): string {
  const grain = county.fields.filter((f) => f.status === FieldStatus.Grain);
  const sown = grain.filter((f) => f.sacksPlanted > 0);
  if (sown.length === 0) return CROP_BARE; // fallow or just harvested
  const growth = Math.max(...sown.map((f) => f.grainGrowth));
  return growth >= 0.66 ? CROP_RIPE : CROP_GROWING;
}

/** STATIC icon for extractive/fishery tiles (agriculture handled dynamically). */
function industryIcon(resource: TileResource, cx: number, cy: number): SVGElement | null {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('pointer-events', 'none');
  switch (resource) {
    case TileResource.Wood:
      g.appendChild(el('polygon', { points: `${cx},${cy - 4} ${cx - 3},${cy + 1} ${cx + 3},${cy + 1}`, fill: '#1f3d1c' }));
      g.appendChild(el('rect', { x: cx - 0.7, y: cy + 1, width: 1.4, height: 2.5, fill: '#3a2c18' }));
      return g;
    case TileResource.Stone:
      g.appendChild(el('polygon', { points: `${cx},${cy - 3.5} ${cx + 3},${cy} ${cx},${cy + 3.5} ${cx - 3},${cy}`, fill: '#cfcabd', stroke: '#555', 'stroke-width': 0.4 }));
      return g;
    case TileResource.Iron:
      g.appendChild(el('polygon', { points: `${cx - 3},${cy + 3} ${cx + 3},${cy + 3} ${cx},${cy - 3}`, fill: '#3b3b44', stroke: '#9aa', 'stroke-width': 0.4 }));
      return g;
    case TileResource.Fish:
      g.appendChild(el('path', { d: `M${cx - 3},${cy} q1.5,-2 3,0 q1.5,2 3,0`, fill: 'none', stroke: '#9fd6e8', 'stroke-width': 0.9 }));
      return g;
    default:
      return null;
  }
}

function cropPatch(cx: number, cy: number, fill: string): SVGElement {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('pointer-events', 'none');
  g.appendChild(el('rect', { x: cx - 4.5, y: cy - 3.5, width: 9, height: 7, rx: 1, fill, stroke: '#2c1d0f', 'stroke-width': 0.3 }));
  for (let i = -1; i <= 1; i++) {
    g.appendChild(el('line', { x1: cx - 4, y1: cy + i * 2, x2: cx + 4, y2: cy + i * 2, stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 0.3 }));
  }
  return g;
}

function livestock(cx: number, cy: number): SVGElement {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('pointer-events', 'none');
  g.appendChild(el('rect', { x: cx - 4.5, y: cy - 3.5, width: 9, height: 7, rx: 1, fill: '#7fae4e', stroke: '#3a4a22', 'stroke-width': 0.3 }));
  g.appendChild(el('circle', { cx, cy, r: 1, fill: '#efe6d2' }));
  return g;
}

function house(cx: number, cy: number): SVGElement {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('pointer-events', 'none');
  g.appendChild(el('rect', { x: cx - 1.6, y: cy - 0.4, width: 3.2, height: 2.6, fill: '#f0e2c2', stroke: '#3a2c18', 'stroke-width': 0.3 }));
  g.appendChild(el('polygon', { points: `${cx - 2},${cy - 0.4} ${cx + 2},${cy - 0.4} ${cx},${cy - 2.6}`, fill: '#8a3b2a' }));
  return g;
}

/** A keep with battlements and an owner-coloured flag. */
function castleIcon(cx: number, cy: number, colour: string): SVGElement {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('pointer-events', 'none');
  g.appendChild(el('rect', { x: cx - 4, y: cy - 3, width: 8, height: 6, fill: '#9a9286', stroke: '#2e2a22', 'stroke-width': 0.5 }));
  // battlements
  for (let i = -4; i < 4; i += 2) {
    g.appendChild(el('rect', { x: cx + i, y: cy - 4.5, width: 1.2, height: 1.6, fill: '#9a9286', stroke: '#2e2a22', 'stroke-width': 0.3 }));
  }
  // flag pole + owner flag
  g.appendChild(el('line', { x1: cx, y1: cy - 4.5, x2: cx, y2: cy - 8, stroke: '#2e2a22', 'stroke-width': 0.5 }));
  g.appendChild(el('polygon', { points: `${cx},${cy - 8} ${cx + 4},${cy - 7} ${cx},${cy - 6}`, fill: colour, stroke: '#2e2a22', 'stroke-width': 0.3 }));
  return g;
}

/** An army banner in the owner's colour; ringed when selected. */
function armyIcon(cx: number, cy: number, colour: string, selected: boolean): SVGGElement {
  const g = document.createElementNS(SVGNS, 'g') as SVGGElement;
  if (selected) g.appendChild(el('circle', { cx, cy, r: 6, fill: 'none', stroke: '#ffe9a8', 'stroke-width': 1.2 }));
  // shield
  g.appendChild(el('path', {
    d: `M${cx - 3.5},${cy - 3.5} L${cx + 3.5},${cy - 3.5} L${cx + 3.5},${cy + 0.5} Q${cx},${cy + 5} ${cx - 3.5},${cy + 0.5} Z`,
    fill: colour, stroke: '#15110a', 'stroke-width': 0.6,
  }));
  g.appendChild(el('line', { x1: cx, y1: cy - 3, x2: cx, y2: cy + 2.5, stroke: 'rgba(255,255,255,0.6)', 'stroke-width': 0.5 }));
  return g;
}

function dist2(a: Pt, b: Pt): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

export class MapTilesSvg {
  private root: HTMLDivElement;
  private svg: SVGSVGElement;
  private tiles = new Map<string, { poly: SVGPolygonElement; base: string; countyId: string | null }>();
  private counties = new Map<string, CountyView>();
  private farms: SVGGElement;
  private settle: SVGGElement;
  private castles: SVGGElement;
  private units: SVGGElement;
  private paths: SVGGElement;
  /** Pan/zoom is applied to this group (all layers live inside it). */
  private viewport: SVGGElement;
  private z = 1;
  private tx = 0;
  private ty = 0;
  private centre: Pt = [0, 0];
  private lastState: GameState | null = null;
  private selectedArmyId: string | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.setAttribute('data-testid', 'map');
    this.root.style.cssText =
      'position:fixed;left:0;top:0;bottom:0;width:calc(100% - 380px);' +
      'background:#0b1420;display:flex;align-items:center;justify-content:center;z-index:5;overflow:hidden;';
    this.svg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('data-testid', 'map-svg');
    this.svg.style.cssText = 'height:97%;max-width:97%;cursor:grab;';
    this.viewport = document.createElementNS(SVGNS, 'g');
    this.viewport.setAttribute('data-testid', 'map-viewport');
    this.farms = document.createElementNS(SVGNS, 'g');
    this.farms.setAttribute('data-testid', 'farms');
    this.settle = document.createElementNS(SVGNS, 'g');
    this.settle.setAttribute('data-testid', 'settlements');
    this.castles = document.createElementNS(SVGNS, 'g');
    this.castles.setAttribute('data-testid', 'castles');
    this.units = document.createElementNS(SVGNS, 'g');
    this.units.setAttribute('data-testid', 'units');
    this.paths = document.createElementNS(SVGNS, 'g');
    this.paths.setAttribute('data-testid', 'paths');

    this.build();
    this.svg.appendChild(this.viewport);
    this.root.append(this.zoomControls(), this.svg);
    this.setupNavigation();
    stateBus.subscribe((state) => this.update(state));
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.root);
  }

  private build(): void {
    const map = buildBritainTileMap();
    const names = new Map(BRITAIN.regions.map((r) => [r.id, r.name]));
    const grouped = new Map<string, HexTile[]>();
    const terrainLayer = document.createElementNS(SVGNS, 'g');
    const industryLayer = document.createElementNS(SVGNS, 'g');
    const labelLayer = document.createElementNS(SVGNS, 'g');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const tile of map.tiles) {
      const [ux, uy] = hexCentre(tile.col, tile.row);
      const cx = ux * S;
      const cy = uy * S;
      minX = Math.min(minX, cx - S); maxX = Math.max(maxX, cx + S);
      minY = Math.min(minY, cy - S); maxY = Math.max(maxY, cy + S);

      const base = TERRAIN_FILL[tile.terrain];
      const poly = el('polygon', { points: hexPoints(cx, cy), fill: base, stroke: '#10151c', 'stroke-width': 0.4 }) as SVGPolygonElement;
      if (tile.countyId) poly.style.cursor = 'pointer';
      const { col, row, countyId } = tile;
      poly.addEventListener('click', () => tileClicked(countyId, col, row));
      terrainLayer.appendChild(poly);
      this.tiles.set(`${tile.col},${tile.row}`, { poly, base, countyId: tile.countyId });

      const icon = industryIcon(tile.resource, cx, cy);
      if (icon) industryLayer.appendChild(icon);

      if (tile.countyId) {
        const list = grouped.get(tile.countyId) ?? [];
        list.push(tile);
        grouped.set(tile.countyId, list);
      }
    }

    for (const [countyId, list] of grouped) {
      const cx = (list.reduce((s, t) => s + hexCentre(t.col, t.row)[0], 0) / list.length) * S;
      const cy = (list.reduce((s, t) => s + hexCentre(t.col, t.row)[1], 0) / list.length) * S;
      const toPt = (t: HexTile): Pt => { const [ux, uy] = hexCentre(t.col, t.row); return [ux * S, uy * S]; };
      this.counties.set(countyId, {
        wheat: list.filter((t) => t.resource === TileResource.Wheat).map(toPt),
        pasture: list.filter((t) => t.resource === TileResource.Pasture).map(toPt),
        spots: list
          .filter((t) => isPassable(t.terrain) && t.terrain !== Terrain.Coast)
          .map(toPt)
          .sort((a, b) => dist2(a, [cx, cy]) - dist2(b, [cx, cy])),
      });

      const label = el('text', {
        'data-testid': `county-${countyId}-label`,
        x: cx.toFixed(1), y: cy.toFixed(1),
        'text-anchor': 'middle', 'font-size': 6, 'font-weight': 'bold', fill: '#0c0c0c',
      });
      (label as SVGElement).style.cursor = 'pointer';
      label.textContent = (names.get(countyId) ?? countyId).slice(0, 5);
      label.addEventListener('click', () => selectCounty(countyId));
      labelLayer.appendChild(label);
    }

    // County boundaries (Unciv-style borders layer): draw the shared edge
    // between any two adjacent tiles in different counties.
    const bordersLayer = this.buildBorders(map.tiles);
    // Rivers run along hex edges (Unciv-style), drawn from the generated edges.
    const riversLayer = this.buildRivers(map.rivers);

    // Paint order: terrain → borders → rivers → farms → industry → castles →
    // settlements → labels → paths → units (units & paths on top).
    this.viewport.append(
      terrainLayer, bordersLayer, riversLayer, this.farms, industryLayer,
      this.castles, this.settle, labelLayer, this.paths, this.units,
    );

    const pad = 6;
    const vbW = maxX - minX + 2 * pad;
    const vbH = maxY - minY + 2 * pad;
    this.svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${vbW} ${vbH}`);
    this.centre = [minX - pad + vbW / 2, minY - pad + vbH / 2];
  }

  /** Outline counties by drawing the shared edge between differing neighbours. */
  private buildBorders(tiles: HexTile[]): SVGGElement {
    const layer = document.createElementNS(SVGNS, 'g');
    const byKey = new Map(tiles.map((t) => [`${t.col},${t.row}`, t]));
    const seen = new Set<string>();
    for (const tile of tiles) {
      if (tile.countyId === null) continue;
      const [ux, uy] = hexCentre(tile.col, tile.row);
      const c1: Pt = [ux * S, uy * S];
      for (const [nc, nr] of hexNeighbours(tile.col, tile.row)) {
        const n = byKey.get(`${nc},${nr}`);
        if (!n || n.countyId === null || n.countyId === tile.countyId) continue; // only county↔county
        const key = [`${tile.col},${tile.row}`, `${nc},${nr}`].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const [nux, nuy] = hexCentre(nc, nr);
        const c2: Pt = [nux * S, nuy * S];
        const mx = (c1[0] + c2[0]) / 2;
        const my = (c1[1] + c2[1]) / 2;
        const dx = c2[0] - c1[0];
        const dy = c2[1] - c1[1];
        const len = Math.hypot(dx, dy) || 1;
        const px = (-dy / len) * (S / 2);
        const py = (dx / len) * (S / 2);
        const [p1, p2] = this.sharedEdge(c1, c2);
        layer.appendChild(el('line', {
          x1: p1[0].toFixed(1), y1: p1[1].toFixed(1), x2: p2[0].toFixed(1), y2: p2[1].toFixed(1),
          stroke: '#241a0c', 'stroke-width': 1.1, 'stroke-linecap': 'round',
        }));
      }
    }
    return layer;
  }

  /** Endpoints of the hex edge shared by two adjacent tile centres. */
  private sharedEdge(c1: Pt, c2: Pt): [Pt, Pt] {
    const mx = (c1[0] + c2[0]) / 2;
    const my = (c1[1] + c2[1]) / 2;
    const dx = c2[0] - c1[0];
    const dy = c2[1] - c1[1];
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * (S / 2);
    const py = (dx / len) * (S / 2);
    return [[mx - px, my - py], [mx + px, my + py]];
  }

  /** Rivers, drawn along the hex edge each river segment runs on. */
  private buildRivers(rivers: string[]): SVGGElement {
    const layer = document.createElementNS(SVGNS, 'g');
    layer.setAttribute('data-testid', 'rivers');
    for (const key of rivers) {
      const [a, b] = key.split('|');
      const [ac, ar] = a.split(',').map(Number);
      const [bc, br] = b.split(',').map(Number);
      const [aux, auy] = hexCentre(ac, ar);
      const [bux, buy] = hexCentre(bc, br);
      const [p1, p2] = this.sharedEdge([aux * S, auy * S], [bux * S, buy * S]);
      layer.appendChild(el('line', {
        x1: p1[0].toFixed(1), y1: p1[1].toFixed(1), x2: p2[0].toFixed(1), y2: p2[1].toFixed(1),
        stroke: '#3f7fb0', 'stroke-width': 2, 'stroke-linecap': 'round',
      }));
    }
    return layer;
  }

  private update(state: GameState): void {
    // Owner tint.
    for (const { poly, base, countyId } of this.tiles.values()) {
      const owner = countyId ? state.counties[countyId]?.ownerId ?? null : null;
      poly.setAttribute('fill', owner && OWNER_COLOR[owner] ? mix(base, OWNER_COLOR[owner], 0.45) : base);
    }

    // Farms (worked crop/pasture tiles) + settlements, rebuilt from state.
    while (this.farms.firstChild) this.farms.removeChild(this.farms.firstChild);
    while (this.settle.firstChild) this.settle.removeChild(this.settle.firstChild);

    for (const [countyId, view] of this.counties) {
      const county = state.counties[countyId];
      if (!county) continue;

      const hasGrain = county.fields.some((f) => f.status === FieldStatus.Grain);
      if (hasGrain) {
        const colour = grainColour(county);
        for (const [x, y] of view.wheat) this.farms.appendChild(cropPatch(x, y, colour));
      }
      const hasCattle = county.fields.some((f) => f.status === FieldStatus.Cattle) && county.food.cows > 0;
      if (hasCattle) {
        for (const [x, y] of view.pasture) this.farms.appendChild(livestock(x, y));
      }

      const villages = Math.min(view.spots.length, Math.floor(county.population / POP_PER_VILLAGE));
      for (let i = 0; i < villages; i++) {
        const [x, y] = view.spots[i];
        this.settle.appendChild(house(x, y));
      }
    }

    this.lastState = state;
    this.drawCastles(state);
    this.drawUnits(state);
    while (this.paths.firstChild) this.paths.removeChild(this.paths.firstChild); // clear stale move preview
  }

  /** Castles sit on the county town tile (the centre-most passable tile). */
  private drawCastles(state: GameState): void {
    while (this.castles.firstChild) this.castles.removeChild(this.castles.firstChild);
    for (const [countyId, view] of this.counties) {
      const county = state.counties[countyId];
      if (!county || county.castle.type === CastleType.None || view.spots.length === 0) continue;
      const owner = county.ownerId;
      const colour = owner && OWNER_COLOR[owner] ? OWNER_COLOR[owner] : '#888';
      this.castles.appendChild(castleIcon(view.spots[0][0], view.spots[0][1], colour));
    }
  }

  private drawUnits(state: GameState): void {
    while (this.units.firstChild) this.units.removeChild(this.units.firstChild);
    for (const army of Object.values(state.armies)) {
      const [ux, uy] = hexCentre(army.col, army.row);
      const colour = OWNER_COLOR[army.ownerId] ?? '#888';
      const g = armyIcon(ux * S, uy * S, colour, army.id === this.selectedArmyId);
      g.setAttribute('data-testid', `army-${army.id}`);
      (g as SVGElement).style.cursor = 'pointer';
      g.addEventListener('click', (e) => { e.stopPropagation(); armyClicked(army.id); });
      this.units.appendChild(g);
    }
  }

  /** Highlight the selected army and (optionally) preview its route to a tile. */
  setSelectedArmy(armyId: string | null): void {
    this.selectedArmyId = armyId;
    if (this.lastState) this.drawUnits(this.lastState);
  }

  /** Draw the path an army would take to (col,row), as a route preview. */
  previewPath(fromCol: number, fromRow: number, toCol: number, toRow: number): void {
    while (this.paths.firstChild) this.paths.removeChild(this.paths.firstChild);
    const path = findTilePath(buildBritainTileMap(), { col: fromCol, row: fromRow }, { col: toCol, row: toRow });
    if (!path) return;
    const pts = path.tiles.map((t) => { const [x, y] = hexCentre(t.col, t.row); return `${(x * S).toFixed(1)},${(y * S).toFixed(1)}`; });
    this.paths.appendChild(el('polyline', {
      points: pts.join(' '), fill: 'none', stroke: '#ffe9a8', 'stroke-width': 1.6,
      'stroke-dasharray': '3 2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none',
    }));
  }

  // --- pan / zoom -------------------------------------------------------

  private applyView(): void {
    this.viewport.setAttribute('transform', `translate(${this.tx.toFixed(2)} ${this.ty.toFixed(2)}) scale(${this.z.toFixed(3)})`);
  }

  /** Convert client (screen) coords into the SVG's user-space coords. */
  private svgPoint(clientX: number, clientY: number): Pt {
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = this.svg.getScreenCTM();
    if (!m) return [clientX, clientY];
    const p = pt.matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  /** Zoom by `factor` keeping the user-space point (sx,sy) fixed on screen. */
  private zoomAround(sx: number, sy: number, factor: number): void {
    const next = Math.max(1, Math.min(10, this.z * factor));
    const f = next / this.z;
    this.tx = sx - (sx - this.tx) * f;
    this.ty = sy - (sy - this.ty) * f;
    this.z = next;
    if (this.z === 1) { this.tx = 0; this.ty = 0; } // snap back to full map
    this.applyView();
  }

  private zoomControls(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:8px;top:8px;display:flex;flex-direction:column;gap:4px;z-index:6;';
    const mk = (testId: string, label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.setAttribute('data-testid', testId);
      b.textContent = label;
      b.style.cssText = 'width:28px;height:28px;cursor:pointer;font-weight:bold;';
      b.onclick = onClick;
      return b;
    };
    bar.append(
      mk('map-zoom-in', '+', () => this.zoomAround(this.centre[0], this.centre[1], 1.3)),
      mk('map-zoom-out', '−', () => this.zoomAround(this.centre[0], this.centre[1], 1 / 1.3)),
      mk('map-zoom-reset', '⟳', () => { this.z = 1; this.tx = 0; this.ty = 0; this.applyView(); }),
    );
    return bar;
  }

  private setupNavigation(): void {
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [sx, sy] = this.svgPoint(e.clientX, e.clientY);
      this.zoomAround(sx, sy, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    let dragging = false;
    let last: Pt = [0, 0];
    this.svg.addEventListener('pointerdown', (e) => {
      dragging = true;
      last = this.svgPoint(e.clientX, e.clientY);
      this.svg.style.cursor = 'grabbing';
    });
    this.svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = this.svgPoint(e.clientX, e.clientY);
      this.tx += p[0] - last[0];
      this.ty += p[1] - last[1];
      last = p;
      this.applyView();
    });
    const end = () => { dragging = false; this.svg.style.cursor = 'grab'; };
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointerleave', end);
  }
}
