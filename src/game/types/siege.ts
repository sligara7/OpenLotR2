/* Siege — an army's multi-season investment of an enemy garrisoned castle. */

export interface Siege {
  /** County whose castle is under siege. */
  countyId: string;
  /** Realm conducting the siege (the army's owner). */
  attackerRealmId: string;
  /** Army maintaining the siege; if it dies or marches off, the siege lifts. */
  besiegerArmyId: string;
  /** 0..1 progress toward breaching the walls (an assault triggers at 1). */
  progress: number;
  /** Seasons the siege has been underway (for reporting). */
  seasons: number;
}
