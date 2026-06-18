/* World construction and lookups (counties + realms + adjacency graph). */

import { Season } from '../types/enums.ts';
import type { Adjacency, GameState, Realm } from '../types/realm.ts';
import type { County } from '../types/county.ts';

export interface WorldInit {
  realms: Realm[];
  counties: County[];
  /** Undirected edges between county ids; normalised to a symmetric map. */
  edges?: [string, string][];
  year?: number;
  season?: Season;
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

  return {
    year: init.year ?? 1,
    season: init.season ?? Season.Spring,
    turn: 0,
    realms,
    counties,
    adjacency,
  };
}

export function neighboursOf(state: GameState, countyId: string): County[] {
  return (state.adjacency[countyId] ?? []).map((id) => state.counties[id]);
}

export function countiesOfRealm(state: GameState, realmId: string): County[] {
  return Object.values(state.counties).filter((c) => c.ownerId === realmId);
}
