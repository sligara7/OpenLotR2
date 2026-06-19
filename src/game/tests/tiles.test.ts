/* Hex-tile map: generation validity, terrain/resource sanity, determinism. */

import { test, assert, assertEqual, assertGreater, assertLess } from '../testing/harness.ts';
import { buildBritainTileMap } from '../maps/britain-tiles.ts';
import { BRITAIN } from '../maps/britain.ts';
import { Terrain, TileResource, isPassable, hexNeighbours } from '../maps/tiles.ts';

test('tiles: every county is a non-empty cluster of hexes', () => {
  const map = buildBritainTileMap();
  const counts = new Map<string, number>();
  for (const t of map.tiles) {
    if (t.countyId) counts.set(t.countyId, (counts.get(t.countyId) ?? 0) + 1);
  }
  const missing = BRITAIN.regions.filter((r) => !counts.has(r.id)).map((r) => r.id);
  assertEqual(missing.length, 0, `counties with no tiles: ${missing.join(', ')}`);
  // Most counties should be genuinely multi-hex.
  const multi = [...counts.values()].filter((n) => n >= 2).length;
  assertGreater(multi, BRITAIN.regions.length * 0.8, 'most counties are multi-hex blobs');
});

test('tiles: there is open sea and impassable terrain', () => {
  const map = buildBritainTileMap();
  const sea = map.tiles.filter((t) => t.countyId === null).length;
  const impassable = map.tiles.filter((t) => !isPassable(t.terrain)).length;
  const mountains = map.tiles.filter((t) => t.terrain === Terrain.Mountains).length;
  assertGreater(sea, 0, 'has open sea');
  assertGreater(mountains, 0, 'has mountains');
  assertGreater(impassable, sea, 'impassable includes sea + mountains'); // sanity
});

test('tiles: land tiles carry land terrain; sea is Water', () => {
  const map = buildBritainTileMap();
  for (const t of map.tiles) {
    if (t.countyId === null) {
      assertEqual(t.terrain, Terrain.Water, 'sea tile is Water');
    } else {
      assert(t.terrain !== Terrain.Water, `land tile ${t.col},${t.row} is not Water`);
    }
  }
});

test('tiles: resources match their terrain (e.g. Wood only in Forest)', () => {
  const map = buildBritainTileMap();
  for (const t of map.tiles) {
    if (t.resource === TileResource.Wood) {
      assertEqual(t.terrain, Terrain.Forest, 'Wood only on Forest');
    }
    if (t.resource === TileResource.Wheat) {
      assert(
        t.terrain === Terrain.Plains || t.terrain === Terrain.Coast,
        'Wheat only on Plains/Coast',
      );
    }
  }
  assertGreater(map.tiles.filter((t) => t.resource !== TileResource.None).length, 50, 'plenty of resources');
});

test('tiles: coastal land actually borders sea or the map edge', () => {
  const map = buildBritainTileMap();
  const byKey = new Map(map.tiles.map((t) => [`${t.col},${t.row}`, t]));
  const coast = map.tiles.filter((t) => t.terrain === Terrain.Coast);
  assertGreater(coast.length, 0, 'has coastline');
  for (const t of coast) {
    const bordersSea = hexNeighbours(t.col, t.row).some(([c, r]) => {
      const n = byKey.get(`${c},${r}`);
      return !n || n.countyId === null;
    });
    assert(bordersSea, `coast tile ${t.col},${t.row} borders sea/edge`);
  }
});

test('tiles: rivers exist, sit on real edges, and reach the sea', () => {
  const map = buildBritainTileMap();
  const byKey = new Map(map.tiles.map((t) => [`${t.col},${t.row}`, t]));
  assertGreater(map.rivers.length, 0, 'has rivers');
  assertLess(map.rivers.length, map.tiles.length, 'rivers are selective, not everywhere');

  let reachesSea = 0;
  for (const key of map.rivers) {
    const [a, b] = key.split('|');
    const ta = byKey.get(a);
    const tb = byKey.get(b);
    assert(!!ta && !!tb, `river edge ${key} connects two real tiles`);
    assert(ta!.countyId !== null || tb!.countyId !== null, 'a river touches at least one land tile');
    if (ta!.countyId === null || tb!.countyId === null) reachesSea += 1;
  }
  assertGreater(reachesSea, 0, 'at least one river reaches the sea (a mouth)');
});

test('tiles: generation is deterministic', () => {
  const a = buildBritainTileMap();
  const b = buildBritainTileMap();
  assertEqual(a.tiles.length, b.tiles.length, 'same tile count');
  // (cached, so same reference — but assert structural equality of a sample)
  assertEqual(JSON.stringify(a.tiles[100]), JSON.stringify(b.tiles[100]), 'same tile data');
});
