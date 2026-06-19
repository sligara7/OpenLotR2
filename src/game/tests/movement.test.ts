/* Tile movement / pathfinding over the Britain map (maps/movement.ts). */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { buildBritainTileMap } from '../maps/britain-tiles.ts';
import { isPassable } from '../maps/tiles.ts';
import { findTilePath } from '../maps/movement.ts';
import { hexNeighbours } from '../maps/tiles.ts';

function tileMap() {
  const map = buildBritainTileMap();
  const byKey = new Map(map.tiles.map((t) => [`${t.col},${t.row}`, t]));
  return { map, byKey };
}

test('movement: a path between adjacent passable tiles never enters impassable terrain', () => {
  const { map, byKey } = tileMap();
  // Find a passable tile with a passable neighbour.
  let from = null, to = null;
  for (const t of map.tiles) {
    if (!isPassable(t.terrain) || t.countyId === null) continue;
    for (const [c, r] of hexNeighbours(t.col, t.row)) {
      const n = byKey.get(`${c},${r}`);
      if (n && isPassable(n.terrain) && n.countyId !== null) { from = t; to = n; break; }
    }
    if (from) break;
  }
  assert(!!from && !!to, 'found two adjacent passable tiles');

  const path = findTilePath(map, from!, to!);
  assert(!!path, 'path exists');
  assertEqual(`${path!.tiles[0].col},${path!.tiles[0].row}`, `${from!.col},${from!.row}`, 'starts at from');
  assertEqual(`${path!.tiles.at(-1)!.col},${path!.tiles.at(-1)!.row}`, `${to!.col},${to!.row}`, 'ends at to');
  for (const t of path!.tiles) assert(isPassable(t.terrain), `path tile ${t.col},${t.row} is passable`);
  assert(path!.cost >= 1, 'has a positive cost');
});

test('movement: the sea is impassable (no path to a water tile)', () => {
  const { map } = tileMap();
  const land = map.tiles.find((t) => t.countyId !== null && isPassable(t.terrain))!;
  const sea = map.tiles.find((t) => t.countyId === null)!;
  assertEqual(findTilePath(map, land, sea), null, 'cannot march into the sea');
});
