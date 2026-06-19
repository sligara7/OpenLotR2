/*
 * SVG hex-tile map — a "living county" view.
 *
 *  - Terrain hexes, tinted toward the owning realm (terrain stays visible).
 *  - A resource-SITE icon on each commodity tile (forest, quarry, mine, wheat,
 *    pasture, fishery) — the land's potential.
 *  - A settlement layer that grows with population: villages appear and spread
 *    across a county's tiles as its people multiply.
 *
 * Pure SVG/DOM: crisp at any scale and Playwright-inspectable.
 */

import { buildBritainTileMap } from '../../game/maps/britain-tiles.ts';
import { BRITAIN } from '../../game/maps/britain.ts';
import { Terrain, TileResource, hexCentre, isPassable, type HexTile } from '../../game/maps/tiles.ts';
import { stateBus } from '../state-bus.ts';
import { selectCounty } from '../game-controller.ts';
import type { GameState } from '../../game/types/realm.ts';

const SVGNS = 'http://www.w3.org/2000/svg';
const S = 10; // hex radius in px

const TERRAIN_FILL: Record<Terrain, string> = {
  Plains: '#6f8f3f',
  Forest: '#2f5a2a',
  Hills: '#9c8a52',
  Mountains: '#6f6f6f',
  Moor: '#7d6f8a',
  Coast: '#c9b87f',
  Water: '#27496b',
};
const OWNER_COLOR: Record<string, string> = { p1: '#3a6ea5', p2: '#a53a3a', p3: '#3aa55a' };

/** People per village; counties sprout more villages as they grow. */
const POP_PER_VILLAGE = 250;

interface CountyView {
  centre: [number, number];
  /** Passable tiles, nearest-to-centre first (where villages settle). */
  spots: { tile: HexTile; px: [number, number] }[];
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

/** A small icon marking the commodity a tile yields (centred at cx,cy). */
function resourceIcon(resource: TileResource, cx: number, cy: number): SVGElement | null {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('pointer-events', 'none');
  switch (resource) {
    case TileResource.Wood: // a little tree
      g.appendChild(el('polygon', { points: `${cx},${cy - 4} ${cx - 3},${cy + 1} ${cx + 3},${cy + 1}`, fill: '#1f3d1c' }));
      g.appendChild(el('rect', { x: cx - 0.7, y: cy + 1, width: 1.4, height: 2.5, fill: '#3a2c18' }));
      break;
    case TileResource.Stone: // a quarried block (diamond)
      g.appendChild(el('polygon', { points: `${cx},${cy - 3.5} ${cx + 3},${cy} ${cx},${cy + 3.5} ${cx - 3},${cy}`, fill: '#cfcabd', stroke: '#555', 'stroke-width': 0.4 }));
      break;
    case TileResource.Iron: // a mine wedge
      g.appendChild(el('polygon', { points: `${cx - 3},${cy + 3} ${cx + 3},${cy + 3} ${cx},${cy - 3}`, fill: '#3b3b44', stroke: '#9aa', 'stroke-width': 0.4 }));
      break;
    case TileResource.Wheat: // three stalks
      for (let i = -1; i <= 1; i++) {
        g.appendChild(el('line', { x1: cx + i * 2, y1: cy + 3, x2: cx + i * 2, y2: cy - 3, stroke: '#e8c84a', 'stroke-width': 1 }));
      }
      break;
    case TileResource.Pasture: // tufts of grass
      g.appendChild(el('circle', { cx: cx - 2, cy: cy + 1, r: 1.4, fill: '#cfe39a' }));
      g.appendChild(el('circle', { cx: cx + 2, cy: cy + 1, r: 1.4, fill: '#cfe39a' }));
      break;
    case TileResource.Fish: // a ripple
      g.appendChild(el('path', { d: `M${cx - 3},${cy} q1.5,-2 3,0 q1.5,2 3,0`, fill: 'none', stroke: '#9fd6e8', 'stroke-width': 0.9 }));
      break;
    default:
      return null;
  }
  return g;
}

/** A tiny house glyph for a settlement. */
function houseIcon(cx: number, cy: number): SVGElement {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('pointer-events', 'none');
  g.appendChild(el('rect', { x: cx - 1.6, y: cy - 0.4, width: 3.2, height: 2.6, fill: '#f0e2c2', stroke: '#3a2c18', 'stroke-width': 0.3 }));
  g.appendChild(el('polygon', { points: `${cx - 2},${cy - 0.4} ${cx + 2},${cy - 0.4} ${cx},${cy - 2.6}`, fill: '#8a3b2a' }));
  return g;
}

export class MapTilesSvg {
  private root: HTMLDivElement;
  private svg: SVGSVGElement;
  private tiles = new Map<string, { poly: SVGPolygonElement; base: string; countyId: string | null }>();
  private counties = new Map<string, CountyView>();
  private settlements: SVGGElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.setAttribute('data-testid', 'map');
    this.root.style.cssText =
      'position:fixed;left:0;top:0;bottom:0;width:calc(100% - 380px);' +
      'background:#0b1420;display:flex;align-items:center;justify-content:center;z-index:5;';
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('data-testid', 'map-svg');
    this.svg.style.cssText = 'height:97%;max-width:97%;';
    this.settlements = document.createElementNS(SVGNS, 'g');
    this.settlements.setAttribute('data-testid', 'settlements');

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
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Terrain hexes + resource icons.
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
      this.svg.appendChild(poly);
      this.tiles.set(`${tile.col},${tile.row}`, { poly, base, countyId: tile.countyId });

      const icon = resourceIcon(tile.resource, cx, cy);
      if (icon) this.svg.appendChild(icon);

      if (tile.countyId) {
        const list = grouped.get(tile.countyId) ?? [];
        list.push(tile);
        grouped.set(tile.countyId, list);
      }
    }

    // Per-county view: centroid + the passable tiles where villages can settle.
    for (const [countyId, list] of grouped) {
      const cx = (list.reduce((s, t) => s + hexCentre(t.col, t.row)[0], 0) / list.length) * S;
      const cy = (list.reduce((s, t) => s + hexCentre(t.col, t.row)[1], 0) / list.length) * S;
      const spots = list
        .filter((t) => isPassable(t.terrain) && t.terrain !== Terrain.Coast)
        .map((tile) => {
          const [ux, uy] = hexCentre(tile.col, tile.row);
          return { tile, px: [ux * S, uy * S] as [number, number] };
        })
        .sort((a, b) => dist2(a.px, [cx, cy]) - dist2(b.px, [cx, cy]));
      this.counties.set(countyId, { centre: [cx, cy], spots });

      const label = el('text', {
        'data-testid': `county-${countyId}-label`,
        x: cx.toFixed(1), y: cy.toFixed(1),
        'text-anchor': 'middle', 'font-size': 6, 'font-weight': 'bold', fill: '#0c0c0c',
      });
      (label as SVGElement).style.cursor = 'pointer';
      label.textContent = (names.get(countyId) ?? countyId).slice(0, 5);
      label.addEventListener('click', () => selectCounty(countyId));
      this.svg.appendChild(label);
    }

    this.svg.appendChild(this.settlements);
    const pad = 6;
    this.svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);
  }

  private update(state: GameState): void {
    // Owner tint.
    for (const { poly, base, countyId } of this.tiles.values()) {
      const owner = countyId ? state.counties[countyId]?.ownerId ?? null : null;
      poly.setAttribute('fill', owner && OWNER_COLOR[owner] ? mix(base, OWNER_COLOR[owner], 0.45) : base);
    }

    // Settlements grow with population.
    while (this.settlements.firstChild) this.settlements.removeChild(this.settlements.firstChild);
    for (const [countyId, view] of this.counties) {
      const county = state.counties[countyId];
      if (!county) continue;
      const villages = Math.min(view.spots.length, Math.floor(county.population / POP_PER_VILLAGE));
      for (let i = 0; i < villages; i++) {
        const [x, y] = view.spots[i].px;
        this.settlements.appendChild(houseIcon(x, y));
      }
    }
  }
}

function dist2(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}
