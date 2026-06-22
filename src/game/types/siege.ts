/* Siege — an army's multi-season investment of an enemy garrisoned castle. */

export type SiegeEngineType = 'catapult' | 'ram' | 'tower';

/** Siege engines the besieger is building: catapults batter walls, rams splinter
 *  the gate, towers scale the walls. More breach power → less castle advantage in
 *  the assault; more engines → longer to build. */
export interface SiegeEngines {
  catapults: number;
  rams: number;
  towers: number;
}

export interface Siege {
  /** County whose castle is under siege. */
  countyId: string;
  /** Realm conducting the siege (the army's owner). */
  attackerRealmId: string;
  /** Army maintaining the siege; if it dies or marches off, the siege lifts. */
  besiegerArmyId: string;
  /** Siege engines being raised (an all-zero set is a pure starve-out blockade). */
  engines: SiegeEngines;
  /** 0..1 build progress toward the chosen engines being ready (assault at 1). */
  progress: number;
  /** Seasons the siege has been underway (for reporting). */
  seasons: number;
}
