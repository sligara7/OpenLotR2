/*
 * Map data model — original geography for OpenLotR2.
 *
 * A GameMap is a graph of regions (historic counties) with a coarse layout grid
 * (col/row, our own coordinate scheme for rendering) and land/ferry adjacency.
 * County names and borders are real-world facts; the layout and tile scheme are
 * our own original work (not derived from any game's artwork).
 */

export type Country = 'England' | 'Wales' | 'Scotland';

export interface MapRegion {
  id: string;
  name: string;
  country: Country;
  /** Coarse layout cell (col = west→east, row = north→south). Our own scheme. */
  col: number;
  row: number;
  /** Adjacent region ids (land borders + short sea/ferry links). */
  neighbours: string[];
}

export interface GameMap {
  id: string;
  name: string;
  regions: MapRegion[];
}

export function regionIds(map: GameMap): Set<string> {
  return new Set(map.regions.map((r) => r.id));
}

/**
 * Undirected, de-duplicated, symmetric edge list derived from the regions'
 * neighbour declarations — so adjacency only has to be written once per pair.
 */
export function mapEdges(map: GameMap): [string, string][] {
  const seen = new Set<string>();
  const edges: [string, string][] = [];
  for (const region of map.regions) {
    for (const other of region.neighbours) {
      const [a, b] = region.id < other ? [region.id, other] : [other, region.id];
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  return edges;
}
