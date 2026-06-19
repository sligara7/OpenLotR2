/*
 * Starting scenarios — reusable initial worlds shared by the CLI demo and the
 * server. Keeping scenario setup in the core (not duplicated per consumer)
 * means one definition of "a new game".
 */

import { createCounty } from './state/county.ts';
import { createRealm } from './state/realm.ts';
import { createWorld } from './state/world.ts';
import { FieldStatus, NoblePersonality, Season } from './types/enums.ts';
import { BRITAIN, mapEdges, buildBritainTileMap, countyProfiles } from './maps/index.ts';
import { WOOD_PER_TILE, STONE_PER_TILE, IRON_PER_TILE } from './constants.ts';
import type { County } from './types/county.ts';
import type { GameState } from './types/realm.ts';

/** Put a working farm in place: assign fields to grain/cattle and lean labour
 *  toward agriculture, so the county can feed itself from turn one. */
function farm(county: County, grainFields: number, cattleFields: number): County {
  let i = 0;
  for (; i < grainFields && i < county.fields.length; i++) {
    county.fields[i].status = FieldStatus.Grain;
    county.fields[i].sacksPlanted = 5; // already in the ground (pre-harvest)
    county.fields[i].grainGrowth = 1;
  }
  for (let j = 0; j < cattleFields && i < county.fields.length; j++, i++) {
    county.fields[i].status = FieldStatus.Cattle;
  }
  county.labour.industryShare = 0.35; // most hands on the land
  return county;
}

/**
 * The default two-player demo: the human holds York + Lancaster (low taxes,
 * thriving), an AI baron holds the over-taxed Kent (primed to revolt). Three
 * counties in a line so immigration flows along the happiness gradient.
 */
export function createDemoWorld(): GameState {
  const player = createRealm({ id: 'p1', name: 'You', isHuman: true, gold: 200 });
  const rival = createRealm({ id: 'p2', name: 'Baron de Vere' });

  const counties = [
    farm(createCounty({
      id: 'york', name: 'York', ownerId: 'p1', population: 320, happiness: 70,
      taxRate: 15, grainSacks: 1500, cows: 60, fieldCount: 8,
      industries: { Lumber: true, Quarry: true },
    }), 4, 4),
    farm(createCounty({
      id: 'lancaster', name: 'Lancaster', ownerId: 'p1', population: 240, happiness: 60,
      taxRate: 18, grainSacks: 1200, cows: 40, fieldCount: 6, industries: { IronMine: true },
    }), 3, 3),
    farm(createCounty({
      id: 'kent', name: 'Kent', ownerId: 'p2', population: 300, happiness: 35,
      taxRate: 55, grainSacks: 1000, cows: 30, fieldCount: 6,
    }), 3, 3),
  ];

  return createWorld({
    realms: [player, rival],
    counties,
    edges: [['york', 'lancaster'], ['lancaster', 'kent']],
    season: Season.Spring,
  });
}

/**
 * Great Britain: every historic county on the BRITAIN map. The human player and
 * two AI rivals each begin with a small home cluster; the rest start neutral
 * (unowned), to be won by conquest. Adjacency comes from the map graph.
 */
export function createBritainWorld(): GameState {
  const player = createRealm({ id: 'p1', name: 'You', isHuman: true, gold: 200 });
  const scots = createRealm({ id: 'p2', name: 'The Bruce', personality: NoblePersonality.Baron });
  const welsh = createRealm({ id: 'p3', name: 'Llywelyn', personality: NoblePersonality.Knight });

  const starts: Record<string, string> = {};
  for (const id of ['hampshire', 'berkshire', 'wiltshire']) starts[id] = 'p1';
  for (const id of ['midlothian', 'lanarkshire', 'fife']) starts[id] = 'p2';
  for (const id of ['glamorgan', 'carmarthenshire', 'breconshire']) starts[id] = 'p3';

  // Each county's economy is derived from the tiles it owns.
  const profiles = countyProfiles(buildBritainTileMap());

  const counties = BRITAIN.regions.map((region) => {
    const ownerId = starts[region.id] ?? null;
    const p = profiles.get(region.id);
    const grainFields = Math.max(1, p?.wheat ?? 0); // every county can grow some grain
    const cattleFields = p?.pasture ?? 0;

    const county = createCounty({
      id: region.id,
      name: region.name,
      ownerId,
      // Bigger (more habitable) counties carry more people.
      population: Math.round(80 + (p?.passable ?? 0) * 30 + (ownerId ? 60 : 0)),
      happiness: ownerId ? 60 : 50,
      taxRate: 18,
      grainSacks: grainFields * 180,
      cows: cattleFields * 8,
      fieldCount: grainFields + cattleFields + 1,
      industries: {
        Lumber: (p?.wood ?? 0) > 0,
        Quarry: (p?.stone ?? 0) > 0,
        IronMine: (p?.iron ?? 0) > 0,
      },
    });

    // Tile-derived production ceilings.
    if (p && p.wood > 0) county.industries.Lumber.capacity = p.wood * WOOD_PER_TILE;
    if (p && p.stone > 0) county.industries.Quarry.capacity = p.stone * STONE_PER_TILE;
    if (p && p.iron > 0) county.industries.IronMine.capacity = p.iron * IRON_PER_TILE;

    farm(county, grainFields, cattleFields);
    return county;
  });

  return createWorld({
    realms: [player, scots, welsh],
    counties,
    edges: mapEdges(BRITAIN),
    season: Season.Spring,
  });
}
