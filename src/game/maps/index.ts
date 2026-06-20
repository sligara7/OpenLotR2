/* Map registry + public surface. */

export type { GameMap, MapRegion, Country } from './types.ts';
export { mapEdges, regionIds } from './types.ts';
export { BRITAIN } from './britain.ts';
export { Terrain, TileResource, isPassable, hexCentre, hexNeighbours, edgeKey, countyProfiles, countyTowns } from './tiles.ts';
export type { HexTile, TileMap, ResourceCounts } from './tiles.ts';
export { buildBritainTileMap } from './britain-tiles.ts';
export { offsetToCube, cubeToOffset, hexDistance, hexLine, findPath } from './hex.ts';
export type { Offset, Cube } from './hex.ts';
export { findTilePath, advanceWithinBudget, RIVER_CROSS_COST } from './movement.ts';
export type { TilePath } from './movement.ts';

import type { GameMap } from './types.ts';
import { BRITAIN } from './britain.ts';

export const MAPS: Record<string, GameMap> = {
  britain: BRITAIN,
};
