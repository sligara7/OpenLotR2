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
import { Terrain, TileResource, hexCentre, isPassable, type HexTile } from '../../game/maps/tiles.ts';
import { stateBus } from '../state-bus.ts';
import { selectCounty } from '../game-controller.ts';
import { FieldStatus } from '../../game/types/enums.ts';
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

  constructor() {
    this.root = document.createElement('div');
    this.root.setAttribute('data-testid', 'map');
    this.root.style.cssText =
      'position:fixed;left:0;top:0;bottom:0;width:calc(100% - 380px);' +
      'background:#0b1420;display:flex;align-items:center;justify-content:center;z-index:5;';
    this.svg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('data-testid', 'map-svg');
    this.svg.style.cssText = 'height:97%;max-width:97%;';
    this.farms = document.createElementNS(SVGNS, 'g');
    this.farms.setAttribute('data-testid', 'farms');
    this.settle = document.createElementNS(SVGNS, 'g');
    this.settle.setAttribute('data-testid', 'settlements');

    this.build();
    this.root.appendChild(this.svg);
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
      if (tile.countyId) {
        poly.style.cursor = 'pointer';
        poly.addEventListener('click', () => selectCounty(tile.countyId as string));
      }
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

    // Paint order: terrain → farms → industry → labels → settlements.
    this.svg.append(terrainLayer, this.farms, industryLayer, labelLayer, this.settle);
    const pad = 6;
    this.svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);
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
  }
}
