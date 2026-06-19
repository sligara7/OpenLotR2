/* Army — a body of soldiers positioned on a map tile. */

export interface Army {
  id: string;
  /** Realm that controls this army. */
  ownerId: string;
  /** Tile position (odd-r offset coords). */
  col: number;
  row: number;
  /** Number of soldiers (flavour for now; combat comes later). */
  soldiers: number;
}
