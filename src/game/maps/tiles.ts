/*
 * Hex-tile map model.
 *
 * A finer-grained map than one-hex-per-county: the map is a hex grid of TILES,
 * each with a terrain type, an optional resource (commodity), and the county it
 * belongs to (or none, for sea). A county is therefore a *cluster* of hexes
 * approximating its shape. Some terrain is impassable (mountains, water) — armies
 * cannot march across it.
 *
 * Concepts (biome vocabulary, nearest-cell region assignment, settlement tiers)
 * are adapted from the author's own MIT-licensed `mapwright` project; the code
 * here is an original TypeScript implementation.
 *
 * Layout: pointy-top hexes, odd-r offset (odd rows shifted right) — matching the
 * SVG renderer.
 */

export const Terrain = {
  Plains: 'Plains',
  Forest: 'Forest',
  Hills: 'Hills',
  Mountains: 'Mountains', // impassable
  Moor: 'Moor',
  Coast: 'Coast',
  Water: 'Water', // impassable
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** Commodity a tile yields (or None). Drives where industries/farms can sit. */
export const TileResource = {
  Wheat: 'Wheat',
  Pasture: 'Pasture',
  Wood: 'Wood',
  Stone: 'Stone',
  Iron: 'Iron',
  Fish: 'Fish',
  None: 'None',
} as const;
export type TileResource = (typeof TileResource)[keyof typeof TileResource];

export interface HexTile {
  col: number;
  row: number;
  terrain: Terrain;
  resource: TileResource;
  /** Owning county id, or null for open sea. */
  countyId: string | null;
}

export interface TileMap {
  id: string;
  name: string;
  cols: number;
  rows: number;
  tiles: HexTile[];
}

const IMPASSABLE: ReadonlySet<Terrain> = new Set([Terrain.Mountains, Terrain.Water]);

export function isPassable(terrain: Terrain): boolean {
  return !IMPASSABLE.has(terrain);
}

/** Pointy-top hex pixel centre for a unit hex radius (renderer scales it up). */
export function hexCentre(col: number, row: number): [number, number] {
  const SQRT3 = Math.sqrt(3);
  return [SQRT3 * (col + 0.5 * (row & 1)), 1.5 * row];
}

/** Odd-r offset neighbours of a hex (the six adjacent cells). */
export function hexNeighbours(col: number, row: number): [number, number][] {
  const odd = row & 1;
  const deltas: [number, number][] = odd
    ? [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]]
    : [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
  return deltas.map(([dc, dr]) => [col + dc, row + dr]);
}
