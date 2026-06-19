/* Army — a body of soldiers positioned on a map tile. */

export interface Army {
  id: string;
  /** Realm that controls this army. */
  ownerId: string;
  /** Tile position (odd-r offset coords). */
  col: number;
  row: number;
  /** County the army currently occupies (the tile's owner), or null over sea.
   *  Denormalised from the map so the engine can forage without a map import. */
  countyId: string | null;
  /** Number of soldiers (flavour for now; combat comes later). */
  soldiers: number;
}
