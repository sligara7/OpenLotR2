/*
 * Degrees → hex grid.
 *
 * One small affine projection shared by everything that has to agree on where a
 * place is: the coastline rasteriser and the county centres. Get these out of
 * step and counties drift out of their own coast, so both go through here.
 *
 * The projection is equirectangular with a standard parallel through the middle
 * of Britain: longitude is multiplied by cos(parallel) so the island keeps its
 * real proportions instead of being stretched east-west the way raw lon/lat
 * would stretch it. That is the whole of it — at this scale nothing more
 * elaborate would be visible, and an affine map is trivially invertible and
 * exactly reproducible, which the determinism rule wants.
 *
 * Output is the hex PIXEL space `tiles.ts` already uses: pointy-top hexes on an
 * odd-r offset grid, where a hex has size 1, columns are SQRT3 apart and rows
 * 1.5 apart.
 */

import { BRITAIN_BOUNDS, BRITAIN_OUTLINE, STRAITS, type Ring } from './britain-outline.ts';

/** Middle of Britain. Longitudes are flattened by cos of this. */
const STANDARD_PARALLEL = 54.5;

/** Blank hexes kept around the land, so nothing touches the map edge. */
const PAD = 1;

const SQRT3 = Math.sqrt(3);
const RAD = Math.PI / 180;

export interface Projection {
  readonly cols: number;
  readonly rows: number;
  /** [longitude, latitude] → hex pixel space. */
  project(lon: number, lat: number): [number, number];
}

/**
 * Build a projection sized to fit the coastline in `rows` hex rows.
 *
 * `rows` is the map's one resolution knob: everything else — the column count,
 * the scale, how many hexes a county gets — follows from it and from the real
 * shape of the island.
 */
export function buildProjection(rows: number): Projection {
  const [west, south, east, north] = BRITAIN_BOUNDS;
  const flatten = Math.cos(STANDARD_PARALLEL * RAD);

  const geoWidth = (east - west) * flatten;
  const geoHeight = north - south;

  // Degrees of latitude per hex-pixel unit, set so the land spans the rows we
  // were given, less the padding at top and bottom.
  const scale = (1.5 * (rows - 1 - 2 * PAD)) / geoHeight;

  // Columns follow from the island's real aspect — never assumed.
  const cols = Math.ceil((geoWidth * scale) / SQRT3) + 1 + 2 * PAD;

  return {
    cols,
    rows,
    project(lon: number, lat: number): [number, number] {
      return [
        (lon - west) * flatten * scale + SQRT3 * PAD,
        (north - lat) * scale + 1.5 * PAD,
      ];
    },
  };
}

/** Centre of hex (col, row) in pixel space — pointy-top, odd-r offset. */
export function hexPixel(col: number, row: number): [number, number] {
  return [SQRT3 * (col + 0.5 * (row & 1)), 1.5 * row];
}

/** A closed ring projected into hex pixel space. */
export type PixelRing = readonly (readonly [number, number])[];

/** Project every coastline ring once, ready for repeated inside-tests. */
export function projectOutline(projection: Projection): PixelRing[] {
  return BRITAIN_OUTLINE.map((ring: Ring) =>
    ring.map(([lon, lat]) => projection.project(lon, lat) as readonly [number, number]),
  );
}

/**
 * Is this point inside the ring? Standard ray casting: count the ring edges
 * crossing a ray cast in +x, and an odd count means inside.
 */
function inRing(x: number, y: number, ring: PixelRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    // Does this edge straddle the ray's row? Half-open on purpose: a vertex
    // exactly on the ray is counted once, not twice or never.
    if ((yi > y) === (yj > y)) continue;
    if (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is this point on land — inside any of the landmasses? */
export function inLand(x: number, y: number, rings: readonly PixelRing[]): boolean {
  return rings.some((ring) => inRing(x, y, ring));
}

/** A strait projected into pixel space: a segment plus the half-width around it. */
export interface PixelStrait {
  readonly ax: number; readonly ay: number;
  readonly bx: number; readonly by: number;
  readonly width: number;
}

/** Project the narrow-channel corrections into hex pixel space. */
export function projectStraits(projection: Projection): PixelStrait[] {
  // Latitude degrees and pixel units differ only by the scale, which one row of
  // the projection recovers: 1.5 pixel units per row, so measure it directly.
  const [, y0] = projection.project(0, 1);
  const [, y1] = projection.project(0, 0);
  const perDegree = y1 - y0;
  return STRAITS.map((s) => {
    const [ax, ay] = projection.project(s.from[0], s.from[1]);
    const [bx, by] = projection.project(s.to[0], s.to[1]);
    return { ax, ay, bx, by, width: s.widthDeg * perDegree };
  });
}

/** Does this point lie in one of the narrow channels? */
export function inStrait(x: number, y: number, straits: readonly PixelStrait[]): boolean {
  return straits.some(({ ax, ay, bx, by, width }) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= width;
  });
}
