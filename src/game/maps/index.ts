/* Map registry + public surface. */

export type { GameMap, MapRegion, Country } from './types.ts';
export { mapEdges, regionIds } from './types.ts';
export { BRITAIN } from './britain.ts';

import type { GameMap } from './types.ts';
import { BRITAIN } from './britain.ts';

export const MAPS: Record<string, GameMap> = {
  britain: BRITAIN,
};
