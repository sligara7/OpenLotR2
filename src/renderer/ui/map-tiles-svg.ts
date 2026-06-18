/*
 * SVG hex-tile map.
 *
 * Renders the procedural Britain tile map: each hex coloured by terrain, tinted
 * toward its owner, with a resource glyph where a tile yields a commodity, and
 * village markers that appear as a county's population grows. Counties are
 * multi-hex blobs; mountains and sea read as impassable. Pure SVG/DOM, so it is
 * crisp at any scale and Playwright-inspectable.
 */

import { buildBritainTileMap } from '../../game/maps/britain-tiles.ts';
import { BRITAIN } from '../../game/maps/britain.ts';
import { Terrain, TileResource, hexCentre, type HexTile } from '../../game/maps/tiles.ts';
import { stateBus } from '../state-bus.ts';
import { selectCounty } from '../game-controller.ts';
import type { GameState } from '../../game/types/realm.ts';

const SVGNS = 'http://www.w3.org/2000/svg';
const S = 9; // hex radius in px

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
const RESOURCE_GLYPH: Partial<Record<TileResource, string>> = {
  Wheat: 'W', Pasture: 'P', Wood: 'T', Stone: 'S', Iron: 'I', Fish: 'F',
};

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
  const ch = (shift: number) => {
    const a = (pa >> shift) & 0xff;
    const b = (pb >> shift) & 0xff;
    return Math.round(a + (b - a) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function villageTier(population: number): number {
  if (population >= 800) return 3;
  if (population >= 500) return 2;
  if (population >= 250) return 1;
  return 0;
}

export class MapTilesSvg {
  private root: HTMLDivElement;
  private svg: SVGSVGElement;
  /** key 'col,row' → { polygon, base terrain colour, county }. */
  private tiles = new Map<string, { poly: SVGPolygonElement; base: string; countyId: string | null }>();
  private byCounty = new Map<string, HexTile[]>();
  private villages: SVGGElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.setAttribute('data-testid', 'map');
    this.root.style.cssText =
      'position:fixed;left:0;top:0;bottom:0;width:calc(100% - 380px);' +
      'background:#0b1420;display:flex;align-items:center;justify-content:center;z-index:5;';
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('data-testid', 'map-svg');
    this.svg.style.cssText = 'height:97%;max-width:97%;';
    this.villages = document.createElementNS(SVGNS, 'g');

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
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const tile of map.tiles) {
      const [ux, uy] = hexCentre(tile.col, tile.row);
      const cx = ux * S;
      const cy = uy * S;
      minX = Math.min(minX, cx - S); maxX = Math.max(maxX, cx + S);
      minY = Math.min(minY, cy - S); maxY = Math.max(maxY, cy + S);

      const base = TERRAIN_FILL[tile.terrain];
      const poly = document.createElementNS(SVGNS, 'polygon');
      poly.setAttribute('points', hexPoints(cx, cy));
      poly.setAttribute('fill', base);
      poly.setAttribute('stroke', '#10151c');
      poly.setAttribute('stroke-width', '0.4');
      if (tile.countyId) {
        poly.style.cursor = 'pointer';
        poly.addEventListener('click', () => selectCounty(tile.countyId as string));
      }
      this.svg.appendChild(poly);
      this.tiles.set(`${tile.col},${tile.row}`, { poly, base, countyId: tile.countyId });

      if (tile.countyId) {
        const list = this.byCounty.get(tile.countyId) ?? [];
        list.push(tile);
        this.byCounty.set(tile.countyId, list);
      }

      const glyph = RESOURCE_GLYPH[tile.resource];
      if (glyph) {
        const t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('x', cx.toFixed(1));
        t.setAttribute('y', (cy + 2.5).toFixed(1));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-size', '7');
        t.setAttribute('fill', 'rgba(255,255,255,0.7)');
        t.setAttribute('pointer-events', 'none');
        t.textContent = glyph;
        this.svg.appendChild(t);
      }
    }

    // County labels at each blob's centroid (clickable for testability).
    for (const [countyId, list] of this.byCounty) {
      const cx = (list.reduce((s, t) => s + hexCentre(t.col, t.row)[0], 0) / list.length) * S;
      const cy = (list.reduce((s, t) => s + hexCentre(t.col, t.row)[1], 0) / list.length) * S;
      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('data-testid', `county-${countyId}-label`);
      label.setAttribute('x', cx.toFixed(1));
      label.setAttribute('y', cy.toFixed(1));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '6');
      label.setAttribute('font-weight', 'bold');
      label.setAttribute('fill', '#0c0c0c');
      label.style.cursor = 'pointer';
      label.textContent = (names.get(countyId) ?? countyId).slice(0, 5);
      label.addEventListener('click', () => selectCounty(countyId));
      this.svg.appendChild(label);
    }

    this.svg.appendChild(this.villages);
    const pad = 6;
    this.svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);
  }

  private update(state: GameState): void {
    // Tint each tile toward its owner (terrain stays visible underneath).
    for (const { poly, base, countyId } of this.tiles.values()) {
      const owner = countyId ? state.counties[countyId]?.ownerId ?? null : null;
      poly.setAttribute('fill', owner && OWNER_COLOR[owner] ? mix(base, OWNER_COLOR[owner], 0.45) : base);
    }

    // Villages appear/grow with population.
    while (this.villages.firstChild) this.villages.removeChild(this.villages.firstChild);
    for (const [countyId, list] of this.byCounty) {
      const county = state.counties[countyId];
      if (!county) continue;
      const tier = villageTier(county.population);
      const spots = list.filter((t) => t.terrain !== Terrain.Mountains).slice(0, tier);
      for (const tile of spots) {
        const [ux, uy] = hexCentre(tile.col, tile.row);
        const dot = document.createElementNS(SVGNS, 'circle');
        dot.setAttribute('cx', (ux * S).toFixed(1));
        dot.setAttribute('cy', (uy * S).toFixed(1));
        dot.setAttribute('r', '1.8');
        dot.setAttribute('fill', '#f5e8c8');
        dot.setAttribute('stroke', '#3a2c18');
        dot.setAttribute('stroke-width', '0.4');
        dot.setAttribute('pointer-events', 'none');
        this.villages.appendChild(dot);
      }
    }
  }
}
