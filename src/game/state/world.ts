/* World construction and lookups (counties + realms + adjacency graph). */

import { Season } from '../types/enums.ts';
import { emptyDiplomacy } from '../systems/diplomacy.ts';
import { emptyExploration, revealDisk } from '../systems/exploration.ts';
import type { Adjacency, GameOptions, GameState, Realm } from '../types/realm.ts';
import type { County } from '../types/county.ts';
import type { Army } from '../types/army.ts';

export interface WorldInit {
  realms: Realm[];
  counties: County[];
  /** Undirected edges between county ids; normalised to a symmetric map. */
  edges?: [string, string][];
  armies?: Army[];
  year?: number;
  season?: Season;
  /** Optional advanced rules; defaults to easy play (all off). */
  options?: Partial<GameOptions>;
}

export function createWorld(init: WorldInit): GameState {
  const realms: Record<string, Realm> = {};
  for (const r of init.realms) realms[r.id] = r;

  const counties: Record<string, County> = {};
  for (const c of init.counties) counties[c.id] = c;

  const adjacency: Adjacency = {};
  for (const c of init.counties) adjacency[c.id] = [];
  for (const [a, b] of init.edges ?? []) {
    if (!adjacency[a].includes(b)) adjacency[a].push(b);
    if (!adjacency[b].includes(a)) adjacency[b].push(a);
  }

  const armies: Record<string, Army> = {};
  for (const a of init.armies ?? []) armies[a.id] = a;

  const state: GameState = {
    year: init.year ?? 1,
    season: init.season ?? Season.Spring,
    turn: 0,
    realms,
    counties,
    adjacency,
    armies,
    sieges: {},
    convoys: {},
    diplomacy: emptyDiplomacy(),
    options: {
      advancedFarming: init.options?.advancedFarming ?? false,
      exploration: init.options?.exploration ?? false,
    },
    exploration: emptyExploration(),
    outcome: null,
  };

  // Fog of war: each realm starts seeing the ground around its own armies.
  if (state.options.exploration) {
    for (const a of Object.values(armies)) revealDisk(state, a.ownerId, a.col, a.row);
  }

  return state;
}

export function neighboursOf(state: GameState, countyId: string): County[] {
  return (state.adjacency[countyId] ?? []).map((id) => state.counties[id]);
}

export function countiesOfRealm(state: GameState, realmId: string): County[] {
  return Object.values(state.counties).filter((c) => c.ownerId === realmId);
}
