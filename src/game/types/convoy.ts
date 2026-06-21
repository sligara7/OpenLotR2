/* Supply convoy — a cart of food moving to resupply one of a realm's armies. */

export interface Convoy {
  id: string;
  /** Realm that dispatched it. */
  ownerId: string;
  /** Tile position (odd-r offset coords). */
  col: number;
  row: number;
  /** Food portions carried (delivered to the target army's supply on arrival). */
  food: number;
  /** Army this convoy is trying to reach. */
  targetArmyId: string;
}
