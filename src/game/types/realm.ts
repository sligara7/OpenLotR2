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

/** Optional advanced rules a game can be created with. (Manual Part-8 "Advanced
 *  Play".) Off by default — easy play. Army foraging is always on in this
 *  remake, so it is not a toggle here. */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** Adjustable behaviour dials for the AI rulers. The two multipliers scale each
 *  personality's own value (so the Knight stays more warlike than the Bishop);
 *  `boldness` is the absolute exploration rate. All default to leaving the AI as
 *  designed (aggression 1, diplomacy 1, boldness 0.3). */
export interface AiTuning {
  /** Multiplier on each ruler's personality aggression (0 = pacifist world). */
  aggression: number;
  /** Multiplier on each ruler's taste for diplomacy (0 = no alliances/gifts). */
  diplomacy: number;
  /** Exploration vs exploitation: how often the AI tries a non-greedy front or
   *  gambit instead of the safe choice (0 = pure greedy, ~0.6 = very erratic). */
  boldness: number;
}

export interface GameOptions {
  /** Seasonal grain labour, weather, and fertility all come into play. */
  advancedFarming: boolean;
  /** Fog of war: a realm sees only the land it has explored (plus its own). */
  exploration: boolean;
  /** How hard the AI rulers push (scales their economy & host). */
  difficulty: Difficulty;
  /** Behavioural dials for the AI rulers. */
  ai: AiTuning;
}

/** Per-realm fog-of-war memory: the set of tile keys each realm has explored
 *  ("`${col},${row}`" → true). Monotonic — explored land stays revealed. */
export type ExplorationState = Record<string, Record<string, true>>;

/** How a game ended (null while it is still being played). Victory comes only by
 *  total conquest — eliminating every rival.
 *  - last-standing: every rival realm has been eliminated (the lone victor)
 *  - defeat:        the human player was eliminated while rivals fight on
 *  - extinction:    no realm survives at all */
export interface GameOutcome {
  /** The victorious realm, or null on extinction. */
  winnerId: string | null;
  reason: 'last-standing' | 'defeat' | 'extinction';
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
  /** Standing between realms — opinion, alliances, enemies, pending offers. */
  diplomacy: import('./diplomacy.ts').DiplomacyState;
  /** Optional advanced rules in force for this game. */
  options: GameOptions;
  /** Per-realm explored-tile memory (fog of war); empty when not in use. */
  exploration: ExplorationState;
  /** Set once the game has been decided; null while it is ongoing. */
  outcome: GameOutcome | null;
}
