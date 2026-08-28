/*
 * Procedural hex-tile map for Great Britain.
 *
 * THE COAST DECIDES THE LAND. A real coastline (`britain-outline.ts`, from
 * public-domain Natural Earth data) is rasterised onto the hex grid: a hex is
 * land because it falls inside the island, full stop. Land hexes are then given
 * to the nearest county centre, so counties FILL a true coast instead of
 * defining it. That inversion is the point — the map used to call a hex land if
 * it sat within a radius of some county centre, which made the island a union
 * of circles and is why it read as a cluster of bubbles rather than as Britain.
 *
 * Terrain then follows real relief (the Highlands, the Pennines, Snowdonia and
 * the Brecon Beacons are placed by where they actually are) plus deterministic
 * noise; coastal land becomes Coast; each tile gets a resource suited to its
 * terrain. Fully seed-free and deterministic — same output every run.
 */

import { BRITAIN } from './britain.ts';
import { COUNTY_COORDS } from './britain-coords.ts';
import { buildProjection, hexPixel, inLand, inStrait, projectOutline, projectStraits } from './projection.ts';
import {
  Terrain,
  TileResource,
  edgeKey,
  hexNeighbours,
  isPassable,
  type HexTile,
  type TileMap,
} from './tiles.ts';

/**
 * The map's one resolution knob: how many hex rows the island spans. Columns
 * follow from Britain's real proportions, so this alone sets the tile count.
 *
 * At 120 the grid is 57x120 — 6,840 hexes of which about 2,750 are land, so a
 * county averages 34 tiles and even Clackmannanshire, the smallest, gets 8.
 * That is the point at which a county has a SHAPE rather than a blob, and
 * Cornwall, the Wash and the Bristol Channel read as themselves.
 *
 * Raising it changes every distance in the game at once, so movement budgets
 * and siege and convoy pacing are tuned against this number. Lower it to 100
 * (4,800 hexes) if the tablet struggles; the coastline still reads.
 */
const ROWS = 120;

/** Deterministic [0,1) hash of a cell + salt (no RNG state). */
function hashUnit(a: number, b: number, salt: number): number {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Terrain from real relief.
 *
 * The uplands are placed by where they actually are rather than by which cell of
 * a layout grid a county sat in: the Highlands north-west of the Highland
 * Boundary Fault, the Pennines down England's spine, Snowdonia and the Brecon
 * Beacons in Wales. Within a band the mix is deterministic noise, so the same
 * tile always gets the same terrain.
 */
function terrainFor(country: string, lon: number, lat: number, fc: number, fr: number): Terrain {
  const n = hashUnit(fc, fr, 1);

  if (country === 'Scotland') {
    // The Highland Boundary Fault runs roughly Helensburgh to Stonehaven; north
    // and west of it is mountain country, the Central Belt and Borders are not.
    const highland = lat > 56.0 && lon < -3.0 && lat > 56.0 + (lon + 3.0) * 0.55;
    if (lat > 57.2) return n < 0.45 ? Terrain.Mountains : n < 0.7 ? Terrain.Hills : Terrain.Moor;
    if (highland) return n < 0.35 ? Terrain.Mountains : n < 0.6 ? Terrain.Hills : Terrain.Moor;
    // Central Belt and the Borders: farmland and moor, passable.
    return n < 0.1 ? Terrain.Hills : n < 0.3 ? Terrain.Moor : Terrain.Plains;
  }

  if (country === 'Wales') {
    // Snowdonia in the north-west, the Beacons in the south-east; the coastal
    // strips and the Marches are gentler.
    const snowdonia = lat > 52.6 && lon < -3.5;
    const beacons = lat > 51.7 && lat < 52.2 && lon > -3.9 && lon < -3.1;
    if (snowdonia || beacons) return n < 0.45 ? Terrain.Mountains : n < 0.75 ? Terrain.Hills : Terrain.Moor;
    return n < 0.15 ? Terrain.Mountains : n < 0.5 ? Terrain.Hills : Terrain.Plains;
  }

  // England: the Pennines run north-south through the middle of the north; the
  // Lake District is higher still; Dartmoor and Exmoor sit in the south-west.
  const pennines = lat > 53.0 && lat < 55.3 && lon > -2.7 && lon < -1.6;
  const lakes = lat > 54.3 && lat < 54.8 && lon < -2.8;
  const moors = lat < 51.3 && lon < -3.4;
  if (lakes) return n < 0.5 ? Terrain.Mountains : n < 0.8 ? Terrain.Hills : Terrain.Moor;
  if (pennines) return n < 0.25 ? Terrain.Mountains : n < 0.65 ? Terrain.Hills : Terrain.Moor;
  if (moors) return n < 0.15 ? Terrain.Hills : n < 0.4 ? Terrain.Moor : Terrain.Plains;
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

  const projection = buildProjection(ROWS);
  const { cols, rows } = projection;
  const outline = projectOutline(projection);
  const straits = projectStraits(projection);

  // Every county's centre, projected into the same space as the coastline —
  // which is the whole reason both go through one projection.
  const centres = BRITAIN.regions.map((region) => {
    const coord = COUNTY_COORDS[region.id];
    if (!coord) throw new Error(`No coordinates for county '${region.id}'`);
    return { region, p: projection.project(coord[0], coord[1]) };
  });

  // Pass 1: the coastline says which hexes are land; the nearest centre says
  // whose. A hex outside every landmass is sea, however close a county sits.
  const byKey = new Map<string, HexTile>();
  const key = (c: number, r: number) => `${c},${r}`;

  for (let fr = 0; fr < rows; fr++) {
    for (let fc = 0; fc < cols; fc++) {
      const [x, y] = hexPixel(fc, fr);
      // Inside a landmass, and not in a channel too narrow for the raster to keep.
      const land = inLand(x, y, outline) && !inStrait(x, y, straits);

      let best = centres[0];
      if (land) {
        let bestD = Infinity;
        for (const centre of centres) {
          const dx = x - centre.p[0];
          const dy = y - centre.p[1];
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = centre; }
        }
      }

      const coord = land ? COUNTY_COORDS[best.region.id] : undefined;
      byKey.set(key(fc, fr), {
        col: fc,
        row: fr,
        terrain: land
          ? terrainFor(best.region.country, coord![0], coord![1], fc, fr)
          : Terrain.Water,
        resource: TileResource.None,
        countyId: land ? best.region.id : null,
      });
    }
  }

  // Pass 1.5: every county must own at least one tile. A county whose whole
  // Voronoi cell fell outside the coast — a small one on a crowded stretch of
  // coastline — would otherwise vanish, taking its town, armies and scenario
  // setup with it. Give it the land tile nearest its centre, borrowed from
  // whichever neighbour has tiles to spare.
  claimTileForEveryCounty(byKey, centres);

  // Pass 1.6: every county must be ONE piece. Nearest-centre assignment can cut
  // a county in two around a firth or a mountain — and a county whose town sits
  // in the smaller piece has its own territory unreachable, which breaks
  // movement, sieges and supply. Keep each county's largest blob and give the
  // strays to whichever neighbour already borders them most.
  defragmentCounties(byKey, key);

  // Pass 2: land bordering sea (or the map edge) becomes Coast (mountains keep).
  for (const tile of byKey.values()) {
    if (tile.countyId === null || tile.terrain === Terrain.Mountains) continue;
    const coastal = hexNeighbours(tile.col, tile.row).some(([nc, nr]) => {
      const n = byKey.get(key(nc, nr));
      return !n || n.countyId === null;
    });
    if (coastal) tile.terrain = Terrain.Coast;
  }

  // Pass 2.5: make the land traversable. The relief pass can wall off whole
  // regions (the Highlands) and even strand a single coastal tile, leaving armies
  // unable to march. First carve the fewest mountains to join land-reachable
  // pockets; then bridge any one-tile straits (Voronoi near-touches, e.g. the
  // south-west); then carve again now those bridges have merged masses. Wider sea
  // gaps stay open water — true islands await ferries.
  carvePasses(byKey, key);
  fixCoastInvariant(byKey, key);

  // Pass 3: resources.
  for (const tile of byKey.values()) {
    tile.resource = resourceFor(tile.terrain, tile.col, tile.row);
  }

  // Pass 4: rivers — flow downhill to the sea, carve the high-flux edges.
  const rivers = carveRivers(byKey, key);

  cached = { id: 'britain-tiles', name: 'Great Britain', cols, rows, tiles: [...byKey.values()], rivers };
  return cached;
}

type Key = (c: number, r: number) => string;

/**
 * Give every county a single connected territory.
 *
 * Nearest-centre assignment works on straight-line distance, so a county can be
 * handed two patches of land with water or another county between them. The
 * largest patch stays; each other patch is handed to the neighbouring county it
 * shares the most border with, which keeps the map's county count intact while
 * making every county walkable end to end.
 *
 * Repeated until nothing moves: handing a stray patch to a neighbour can split
 * THAT neighbour, so one pass is not enough. It settles in two or three.
 */
function defragmentCounties(byKey: Map<string, HexTile>, key: Key): void {
  for (let pass = 0; pass < 6; pass++) {
    if (!defragmentOnce(byKey, key)) return;
  }
}

/** One defragmentation sweep. Returns true if any tile changed hands. */
function defragmentOnce(byKey: Map<string, HexTile>, key: Key): boolean {
  let moved = false;
  const byCounty = new Map<string, HexTile[]>();
  for (const t of byKey.values()) {
    if (!t.countyId) continue;
    const list = byCounty.get(t.countyId);
    if (list) list.push(t); else byCounty.set(t.countyId, [t]);
  }

  for (const [id, tiles] of byCounty) {
    // Split this county's tiles into connected blobs.
    const unvisited = new Set(tiles.map((t) => key(t.col, t.row)));
    const blobs: HexTile[][] = [];
    for (const t of tiles) {
      const start = key(t.col, t.row);
      if (!unvisited.has(start)) continue;
      const blob: HexTile[] = [];
      const stack = [t];
      unvisited.delete(start);
      while (stack.length) {
        const cur = stack.pop()!;
        blob.push(cur);
        for (const [nc, nr] of hexNeighbours(cur.col, cur.row)) {
          const k = key(nc, nr);
          if (!unvisited.has(k)) continue;
          unvisited.delete(k);
          stack.push(byKey.get(k)!);
        }
      }
      blobs.push(blob);
    }
    if (blobs.length < 2) continue;

    // Keep the biggest; rehome the rest.
    blobs.sort((a, b) => b.length - a.length);
    for (const stray of blobs.slice(1)) {
      const border = new Map<string, number>();
      for (const t of stray) {
        for (const [nc, nr] of hexNeighbours(t.col, t.row)) {
          const n = byKey.get(key(nc, nr));
          if (n?.countyId && n.countyId !== id) {
            border.set(n.countyId, (border.get(n.countyId) ?? 0) + 1);
          }
        }
      }
      let newOwner: string | null = null;
      let most = 0;
      for (const [cid, n] of border) if (n > most) { most = n; newOwner = cid; }
      // An island fragment touching nobody keeps its county rather than
      // becoming sea: losing land is worse than an odd offshore holding.
      if (newOwner) {
        for (const t of stray) t.countyId = newOwner;
        moved = true;
      }
    }
  }
  return moved;
}


interface Centre {
  region: { id: string; country: string };
  p: [number, number];
}

/**
 * Make sure no county was rasterised out of existence.
 *
 * Nearest-centre assignment only ever hands out tiles that the coastline already
 * called land, so a county packed onto a crowded stretch of coast can end up
 * with none at all — and a county with no tiles has no town, which strands its
 * armies and breaks scenario setup. Rare, but silent when it happens, so it is
 * checked rather than hoped for: each empty county takes the land tile closest
 * to its own centre from whichever neighbour can spare one.
 */
function claimTileForEveryCounty(byKey: Map<string, HexTile>, centres: Centre[]): void {
  const owned = new Map<string, number>();
  for (const t of byKey.values()) {
    if (t.countyId) owned.set(t.countyId, (owned.get(t.countyId) ?? 0) + 1);
  }

  for (const centre of centres) {
    if (owned.get(centre.region.id)) continue;

    let best: HexTile | undefined;
    let bestD = Infinity;
    for (const t of byKey.values()) {
      // Only take from a county that still has more than one tile, so rescuing
      // one county can never empty another.
      if (!t.countyId || (owned.get(t.countyId) ?? 0) <= 1) continue;
      const [x, y] = hexPixel(t.col, t.row);
      const d = (x - centre.p[0]) ** 2 + (y - centre.p[1]) ** 2;
      if (d < bestD) { bestD = d; best = t; }
    }
    if (!best) continue;

    owned.set(best.countyId!, owned.get(best.countyId!)! - 1);
    best.countyId = centre.region.id;
    owned.set(centre.region.id, 1);
  }
}

const isLandTile = (t: HexTile | undefined): t is HexTile => !!t && t.countyId !== null;
const isPassTile = (t: HexTile | undefined): t is HexTile => isLandTile(t) && isPassable(t.terrain);

/** Label every passable land tile with its connected-component id. */
function passableComponents(byKey: Map<string, HexTile>, key: Key): { comp: Map<string, number>; sizes: number[] } {
  const comp = new Map<string, number>();
  const sizes: number[] = [];
  for (const t of byKey.values()) {
    if (!isPassTile(t) || comp.has(key(t.col, t.row))) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [t];
    comp.set(key(t.col, t.row), id);
    while (stack.length) {
      const cur = stack.pop()!;
      size += 1;
      for (const [nc, nr] of hexNeighbours(cur.col, cur.row)) {
        const nb = byKey.get(key(nc, nr));
        if (isPassTile(nb) && !comp.has(key(nc, nr))) { comp.set(key(nc, nr), id); stack.push(nb); }
      }
    }
    sizes[id] = size;
  }
  return { comp, sizes };
}

/**
 * Restore the "Coast ⇒ borders sea" invariant after carving/bridging. Filling a
 * strait can land-lock a tile that used to be coastline (the bridge itself, or an
 * original Coast tile beside it); any Coast no longer touching open water becomes
 * inland Plains. (We only downgrade — never invent new coastline.)
 */
function fixCoastInvariant(byKey: Map<string, HexTile>, key: Key): void {
  for (const t of byKey.values()) {
    if (t.terrain !== Terrain.Coast) continue;
    const bordersSea = hexNeighbours(t.col, t.row).some(([c, r]) => {
      const n = byKey.get(key(c, r));
      return !n || n.countyId === null;
    });
    if (!bordersSea) t.terrain = Terrain.Plains;
  }
}

/**
 * Connect the passable land into one traversable mass by carving the fewest
 * mountains. Repeatedly: find the largest passable component (the "trunk"), then
 * the nearest passable tile in any OTHER component reachable over land (a
 * least-mountains Dijkstra, never crossing water), and convert the mountains on
 * that path into Hills. Stops when the only remaining components are across water
 * (true islands). Deterministic — no RNG.
 */
function carvePasses(byKey: Map<string, HexTile>, key: Key): void {
  const isLand = isLandTile;
  const isPass = isPassTile;
  const components = () => passableComponents(byKey, key);

  for (let guard = 0; guard < 200; guard++) {
    const { comp, sizes } = components();
    if (sizes.length <= 1) break;
    let trunk = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[trunk]) trunk = i;

    // Least-mountains path from the trunk to the nearest other component.
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const pq: { k: string; d: number }[] = [];
    for (const [k, id] of comp) if (id === trunk) { dist.set(k, 0); pq.push({ k, d: 0 }); }

    let target: string | null = null;
    while (pq.length) {
      let mi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[mi].d) mi = i;
      const { k: ck, d: cd } = pq.splice(mi, 1)[0];
      if (cd > (dist.get(ck) ?? Infinity)) continue;
      const here = byKey.get(ck)!;
      if (isPass(here) && comp.get(ck) !== trunk) { target = ck; break; } // reached another mass
      for (const [nc, nr] of hexNeighbours(here.col, here.row)) {
        const nb = byKey.get(key(nc, nr));
        if (!isLand(nb)) continue; // never bridge across water
        const nk = key(nc, nr);
        const nd = cd + (isPassable(nb.terrain) ? 0 : 1); // entering a mountain costs one carve
        if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, ck); pq.push({ k: nk, d: nd }); }
      }
    }
    if (!target) break; // everything left is across water — leave as islands

    for (let cur: string | undefined = target; cur !== undefined; cur = prev.get(cur)) {
      const t = byKey.get(cur)!;
      if (isLand(t) && !isPassable(t.terrain)) t.terrain = Terrain.Hills; // carve a pass
    }
  }
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
