/*
 * Procedural hex-tile map for Great Britain.
 *
 * Each county on the BRITAIN map is a *centre*; every hex within a radius of its
 * nearest centre belongs to that county (a Voronoi-style blob), so a county is a
 * cluster of hexes approximating its shape. Hexes with no nearby centre are sea.
 * Terrain is assigned by country/relief + deterministic noise (Scottish & Welsh
 * highlands get mountains; the Pennines get hills; lowlands are plains/forest);
 * coastal land becomes Coast; each tile then gets a resource suited to its
 * terrain. Fully seed-free and deterministic — same output every run.
 */

import { BRITAIN } from './britain.ts';
import {
  Terrain,
  TileResource,
  edgeKey,
  hexNeighbours,
  type HexTile,
  type TileMap,
} from './tiles.ts';

const F = 2; // fine hexes per county-grid step
const RADIUS = 2.25; // land radius around a county centre (pixel units)
const SQRT3 = Math.sqrt(3);

function px(col: number, row: number): [number, number] {
  return [SQRT3 * (col + 0.5 * (row & 1)), 1.5 * row];
}

/** Deterministic [0,1) hash of a cell + salt (no RNG state). */
function hashUnit(a: number, b: number, salt: number): number {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function terrainFor(country: string, gcol: number, grow: number, fc: number, fr: number): Terrain {
  const n = hashUnit(fc, fr, 1);
  if (country === 'Scotland') {
    if (grow <= 4) return n < 0.45 ? Terrain.Mountains : n < 0.7 ? Terrain.Hills : Terrain.Moor;
    return n < 0.25 ? Terrain.Mountains : n < 0.5 ? Terrain.Hills : n < 0.7 ? Terrain.Moor : Terrain.Plains;
  }
  if (country === 'Wales') {
    return n < 0.4 ? Terrain.Mountains : n < 0.7 ? Terrain.Hills : Terrain.Plains;
  }
  // England: a Pennine highland belt through the central north.
  const pennine = grow >= 11 && grow <= 14 && gcol >= 6 && gcol <= 8;
  if (pennine) return n < 0.3 ? Terrain.Mountains : n < 0.6 ? Terrain.Hills : Terrain.Plains;
  return n < 0.18 ? Terrain.Forest : n < 0.3 ? Terrain.Hills : Terrain.Plains;
}

function resourceFor(terrain: Terrain, fc: number, fr: number): TileResource {
  const n = hashUnit(fc, fr, 2);
  switch (terrain) {
    case Terrain.Plains: return n < 0.45 ? TileResource.Wheat : n < 0.7 ? TileResource.Pasture : TileResource.None;
    case Terrain.Forest: return n < 0.8 ? TileResource.Wood : TileResource.None;
    case Terrain.Hills: return n < 0.35 ? TileResource.Stone : n < 0.6 ? TileResource.Iron : TileResource.None;
    case Terrain.Mountains: return n < 0.2 ? TileResource.Iron : n < 0.4 ? TileResource.Stone : TileResource.None;
    case Terrain.Moor: return n < 0.4 ? TileResource.Pasture : TileResource.None;
    case Terrain.Coast: return n < 0.5 ? TileResource.Fish : n < 0.7 ? TileResource.Wheat : TileResource.None;
    case Terrain.Water: return n < 0.12 ? TileResource.Fish : TileResource.None;
    default: return TileResource.None;
  }
}

let cached: TileMap | null = null;

export function buildBritainTileMap(): TileMap {
  if (cached) return cached;

  const maxCol = Math.max(...BRITAIN.regions.map((r) => r.col));
  const maxRow = Math.max(...BRITAIN.regions.map((r) => r.row));
  const cols = (maxCol + 1) * F + 2;
  const rows = (maxRow + 1) * F + 2;

  // County centres in fine-grid coordinates (offset to the cell centre).
  const centres = BRITAIN.regions.map((region) => ({
    region,
    p: px(region.col * F + 1, region.row * F + 1),
  }));

  // Pass 1: nearest-centre assignment → land (county) or sea.
  const byKey = new Map<string, HexTile>();
  const key = (c: number, r: number) => `${c},${r}`;

  for (let fr = 0; fr < rows; fr++) {
    for (let fc = 0; fc < cols; fc++) {
      const [x, y] = px(fc, fr);
      let best = centres[0];
      let bestD = Infinity;
      for (const centre of centres) {
        const dx = x - centre.p[0];
        const dy = y - centre.p[1];
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = centre; }
      }
      const land = Math.sqrt(bestD) <= RADIUS;
      byKey.set(key(fc, fr), {
        col: fc,
        row: fr,
        terrain: land
          ? terrainFor(best.region.country, best.region.col, best.region.row, fc, fr)
          : Terrain.Water,
        resource: TileResource.None,
        countyId: land ? best.region.id : null,
      });
    }
  }

  // Pass 2: land bordering sea (or the map edge) becomes Coast (mountains keep).
  for (const tile of byKey.values()) {
    if (tile.countyId === null || tile.terrain === Terrain.Mountains) continue;
    const coastal = hexNeighbours(tile.col, tile.row).some(([nc, nr]) => {
      const n = byKey.get(key(nc, nr));
      return !n || n.countyId === null;
    });
    if (coastal) tile.terrain = Terrain.Coast;
  }

  // Pass 3: resources.
  for (const tile of byKey.values()) {
    tile.resource = resourceFor(tile.terrain, tile.col, tile.row);
  }

  // Pass 4: rivers — flow downhill to the sea, carve the high-flux edges.
  const rivers = carveRivers(byKey, key);

  cached = { id: 'britain-tiles', name: 'Great Britain', cols, rows, tiles: [...byKey.values()], rivers };
  return cached;
}

const ELEVATION: Record<string, number> = {
  Mountains: 1.0, Hills: 0.7, Moor: 0.55, Forest: 0.45, Plains: 0.4, Coast: 0.15, Water: 0,
};
const RIVER_FLUX_THRESHOLD = 8; // only major drainage shows as a river

/**
 * Rivers on hex EDGES (Unciv-style). Pseudo-elevation = terrain height + a
 * bias by distance-to-sea (interior is higher) so water drains outward; each
 * land tile flows to its lowest neighbour; flux accumulates downstream; edges
 * carrying enough flux become rivers (rendered along the shared hex edge).
 */
function carveRivers(byKey: Map<string, HexTile>, key: (c: number, r: number) => string): string[] {
  const tiles = [...byKey.values()];
  const land = tiles.filter((t) => t.countyId !== null);

  // Distance to sea (BFS from water) → interior bias.
  const distToSea = new Map<string, number>();
  const queue: HexTile[] = [];
  for (const t of tiles) {
    if (t.countyId === null) { distToSea.set(key(t.col, t.row), 0); queue.push(t); }
  }
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    const d = distToSea.get(key(t.col, t.row))!;
    for (const [nc, nr] of hexNeighbours(t.col, t.row)) {
      const n = byKey.get(key(nc, nr));
      if (n && !distToSea.has(key(nc, nr))) { distToSea.set(key(nc, nr), d + 1); queue.push(n); }
    }
  }

  const elev = (t: HexTile): number =>
    (ELEVATION[t.terrain] ?? 0.4) + (distToSea.get(key(t.col, t.row)) ?? 0) * 0.03 + hashUnit(t.col, t.row, 3) * 0.08;

  // Downhill neighbour (lowest elevation; sea counts as 0).
  const downhill = new Map<string, HexTile>();
  for (const t of land) {
    let best: HexTile | null = null;
    let bestE = elev(t);
    for (const [nc, nr] of hexNeighbours(t.col, t.row)) {
      const n = byKey.get(key(nc, nr));
      if (!n) continue;
      const e = n.countyId === null ? 0 : elev(n);
      if (e < bestE) { bestE = e; best = n; }
    }
    if (best) downhill.set(key(t.col, t.row), best);
  }

  // Accumulate flux from high to low.
  const flux = new Map<string, number>();
  for (const t of land) flux.set(key(t.col, t.row), 1);
  const ordered = [...land].sort((a, b) => elev(b) - elev(a));
  for (const t of ordered) {
    const d = downhill.get(key(t.col, t.row));
    if (d && d.countyId !== null) {
      flux.set(key(d.col, d.row), (flux.get(key(d.col, d.row)) ?? 0) + (flux.get(key(t.col, t.row)) ?? 0));
    }
  }

  // High-flux drainage edges become rivers (deduped).
  const rivers = new Set<string>();
  for (const t of land) {
    if ((flux.get(key(t.col, t.row)) ?? 0) < RIVER_FLUX_THRESHOLD) continue;
    const d = downhill.get(key(t.col, t.row));
    if (d) rivers.add(edgeKey(t.col, t.row, d.col, d.row));
  }
  return [...rivers];
}
