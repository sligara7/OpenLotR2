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
  /** River segments, as canonical keys of the two tiles sharing the edge the
   *  river runs along (see edgeKey). Rivers are on EDGES, not tiles. */
  rivers: string[];
}

/** Canonical key for the undirected edge between two adjacent tiles. */
export function edgeKey(aCol: number, aRow: number, bCol: number, bRow: number): string {
  const a = `${aCol},${aRow}`;
  const b = `${bCol},${bRow}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
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

/** Resource (and land) tile counts for one county — its production potential. */
export interface ResourceCounts {
  wheat: number;
  pasture: number;
  wood: number;
  stone: number;
  iron: number;
  fish: number;
  /** Total land tiles owned (any terrain). */
  land: number;
  /** Land tiles an army could occupy (excludes mountains). */
  passable: number;
}

function emptyCounts(): ResourceCounts {
  return { wheat: 0, pasture: 0, wood: 0, stone: 0, iron: 0, fish: 0, land: 0, passable: 0 };
}

/** Tally each county's resource tiles → its production profile. */
export function countyProfiles(map: TileMap): Map<string, ResourceCounts> {
  const profiles = new Map<string, ResourceCounts>();
  for (const tile of map.tiles) {
    if (tile.countyId === null) continue;
    let p = profiles.get(tile.countyId);
    if (!p) { p = emptyCounts(); profiles.set(tile.countyId, p); }
    p.land += 1;
    if (isPassable(tile.terrain)) p.passable += 1;
    switch (tile.resource) {
      case TileResource.Wheat: p.wheat += 1; break;
      case TileResource.Pasture: p.pasture += 1; break;
      case TileResource.Wood: p.wood += 1; break;
      case TileResource.Stone: p.stone += 1; break;
      case TileResource.Iron: p.iron += 1; break;
      case TileResource.Fish: p.fish += 1; break;
      default: break;
    }
  }
  return profiles;
}

/** Odd-r offset neighbours of a hex (the six adjacent cells). */
export function hexNeighbours(col: number, row: number): [number, number][] {
  const odd = row & 1;
  const deltas: [number, number][] = odd
    ? [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]]
    : [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
  return deltas.map(([dc, dr]) => [col + dc, row + dr]);
}
