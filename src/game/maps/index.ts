/* Map registry + public surface. */

export type { GameMap, MapRegion, Country } from './types.ts';
export { mapEdges, regionIds } from './types.ts';
export { BRITAIN } from './britain.ts';
export { Terrain, TileResource, isPassable, hexCentre, hexNeighbours } from './tiles.ts';
export type { HexTile, TileMap } from './tiles.ts';
export { buildBritainTileMap } from './britain-tiles.ts';

import type { GameMap } from './types.ts';
import { BRITAIN } from './britain.ts';

export const MAPS: Record<string, GameMap> = {
  britain: BRITAIN,
};
