/*
 * SVG county map.
 *
 * Renders the Great Britain map as real SVG in the DOM (not the canvas): one
 * hex cell per county, laid out from the map's own (col,row) grid, coloured by
 * owner from the live GameState. Being SVG/DOM it is resolution-independent
 * (crisp at any zoom), styleable, natively clickable, and Playwright-testable.
 *
 * The hex shapes are generated from our own layout data — original geometry,
 * not traced from any source. A later pass can swap in real boundary polygons
 * (from openly-licensed boundary data) behind the same interface.
 */

import { BRITAIN } from '../../game/maps/index.ts';
import { stateBus } from '../state-bus.ts';
import { selectCounty } from '../game-controller.ts';
import type { GameState } from '../../game/types/realm.ts';

const SVGNS = 'http://www.w3.org/2000/svg';
const S = 16; // hex radius (centre → vertex)
const SQRT3 = Math.sqrt(3);

const OWNER_FILL: Record<string, string> = {
  p1: '#3a6ea5', // player — blue
  p2: '#a53a3a', // Scots — red
  p3: '#3aa55a', // Welsh — green
};
const NEUTRAL = '#5c5246';

/** Pointy-top hex centre for a (col,row) cell; odd rows shift half a cell. */
function centre(col: number, row: number): [number, number] {
  return [SQRT3 * S * (col + 0.5 * (row & 1)), 1.5 * S * row];
}

function hexPoints(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + S * Math.cos(a)).toFixed(1)},${(cy + S * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export class MapSvg {
  private root: HTMLDivElement;
  private svg: SVGSVGElement;
  private cells = new Map<string, SVGPolygonElement>();

  constructor() {
    this.root = document.createElement('div');
    this.root.setAttribute('data-testid', 'map');
    this.root.style.cssText =
      'position:fixed;left:0;top:0;bottom:0;width:calc(100% - 380px);' +
      'background:#0d0b08;display:flex;align-items:center;justify-content:center;z-index:5;';

    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('data-testid', 'map-svg');
    this.svg.style.cssText = 'height:96%;max-width:96%;';

    this.build();
    this.root.appendChild(this.svg);
    stateBus.subscribe((state) => this.recolor(state));
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.root);
  }

  /** Build the static geometry once (colours come later from state). */
  private build(): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const region of BRITAIN.regions) {
      const [cx, cy] = centre(region.col, region.row);
      minX = Math.min(minX, cx - S); maxX = Math.max(maxX, cx + S);
      minY = Math.min(minY, cy - S); maxY = Math.max(maxY, cy + S);

      const group = document.createElementNS(SVGNS, 'g');
      group.setAttribute('data-testid', `county-${region.id}-tile`);
      group.style.cursor = 'pointer';
      group.addEventListener('click', () => selectCounty(region.id));

      const poly = document.createElementNS(SVGNS, 'polygon');
      poly.setAttribute('points', hexPoints(cx, cy));
      poly.setAttribute('fill', NEUTRAL);
      poly.setAttribute('stroke', '#1c160f');
      poly.setAttribute('stroke-width', '1');

      const title = document.createElementNS(SVGNS, 'title');
      title.textContent = region.name;

      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('x', cx.toFixed(1));
      label.setAttribute('y', (cy + 3).toFixed(1));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '7');
      label.setAttribute('fill', '#f0e8d8');
      label.setAttribute('pointer-events', 'none');
      label.textContent = region.name.slice(0, 4);

      group.append(poly, title, label);
      this.svg.appendChild(group);
      this.cells.set(region.id, poly);
    }

    const pad = 4;
    this.svg.setAttribute(
      'viewBox',
      `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`,
    );
  }

  private recolor(state: GameState): void {
    for (const [id, poly] of this.cells) {
      const owner = state.counties[id]?.ownerId ?? null;
      poly.setAttribute('fill', owner && OWNER_FILL[owner] ? OWNER_FILL[owner] : NEUTRAL);
    }
  }
}
