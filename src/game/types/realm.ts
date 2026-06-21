/* Realm (a noble + their shared treasury) and world-level state shapes. */

import type { NoblePersonality } from './enums.ts';
import type { County } from './county.ts';

/**
 * Treasury is shared across ALL counties a realm controls. (Manual Part-3
 * "Managing Multiple Counties": gold, wood, iron, stone and weapons are
 * pooled; only food stays local to a county.)
 */
export interface Treasury {
  gold: number;
  wood: number;
  stone: number;
  iron: number;
  /** Finished weapons by type; kept generic for now. */
  weapons: Record<string, number>;
}

/** A noble — the player or an AI ruler. */
export interface Realm {
  id: string;
  name: string;
  /** null for the human player; set for AI rulers. */
  personality: NoblePersonality | null;
  isHuman: boolean;
  treasury: Treasury;
  /** True once the realm holds no counties and no armies (defeated). */
  eliminated: boolean;
}

/** Static adjacency between counties; drives immigration & contiguity rules. */
export type Adjacency = Record<string, string[]>;

/** How a game ended (null while it is still being played).
 *  - conquest:      a realm holds a supermajority of all counties
 *  - last-standing: every rival realm has been eliminated
 *  - defeat:        the human player was eliminated while rivals fight on
 *  - extinction:    no realm survives at all */
export interface GameOutcome {
  /** The victorious realm, or null on extinction. */
  winnerId: string | null;
  reason: 'conquest' | 'last-standing' | 'defeat' | 'extinction';
}

/** The complete simulated world at a point in time. */
export interface GameState {
  year: number;
  season: import('./enums.ts').Season;
  /** Monotonic turn counter (handy for logs & save versioning). */
  turn: number;
  realms: Record<string, Realm>;
  counties: Record<string, County>;
  adjacency: Adjacency;
  /** Armies on the map, keyed by id. */
  armies: Record<string, import('./army.ts').Army>;
  /** Active sieges, keyed by the besieged county id (one siege per county). */
  sieges: Record<string, import('./siege.ts').Siege>;
  /** Supply convoys in transit, keyed by id. */
  convoys: Record<string, import('./convoy.ts').Convoy>;
  /** Set once the game has been decided; null while it is ongoing. */
  outcome: GameOutcome | null;
}
