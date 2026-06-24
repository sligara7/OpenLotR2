/*
 * Starting scenarios — reusable initial worlds shared by the CLI demo and the
 * server. Keeping scenario setup in the core (not duplicated per consumer)
 * means one definition of "a new game".
 */

import { createCounty } from './state/county.ts';
import { createRealm } from './state/realm.ts';
import { createWorld } from './state/world.ts';
import { createArmy } from './state/army.ts';
import type { UnitCounts } from './types/army.ts';
import { CastleType, FieldStatus, NoblePersonality, Season } from './types/enums.ts';
import { BRITAIN, mapEdges, buildBritainTileMap, countyProfiles, countyTowns } from './maps/index.ts';
import {
  WOOD_PER_TILE, STONE_PER_TILE, IRON_PER_TILE,
  GRAIN_SACKS_PER_FIELD, GRAIN_YIELD_MULTIPLIER,
  FOOD_SURPLUS_TARGET, STARTING_FOOD_SEASONS,
  CASTLE_SPEC, SIEGE, ADVANCED_FARMING, AI_TUNING_DEFAULTS,
} from './constants.ts';
import type { County } from './types/county.ts';
import type { Difficulty, GameOptions, GameState } from './types/realm.ts';
import type { Army } from './types/army.ts';
import type { CastleType as CastleTypeT } from './types/enums.ts';

/** How a custom game is set up (Manual Part-8 "Custom Games"). Every field has
 *  a sensible default, so the plain scenario is just `createBritainWorld()`. */
export interface GameSetup {
  /** Advanced Farming option (seasonal labour, weather, fertility). */
  advancedFarming?: boolean;
  /** Exploration / fog of war option. */
  exploration?: boolean;
  /** How hard the AI rulers push. Default 'normal'. */
  difficulty?: Difficulty;
  /** Total nobles competing for the crown, human + AI (2..5). Default 3. */
  nobles?: number;
  /** Gold (crowns) each realm starts with. Default 200. */
  startingGold?: number;
  /** Soldiers in each realm's starting army (0 = none). Default 40. */
  armySize?: number;
  /** Castle each realm starts with (None = an open, capturable town). Default Motte & Bailey. */
  startingCastle?: CastleTypeT;
  /** How strong each starting county is. Default 'normal'. */
  countyStatus?: 'weak' | 'normal' | 'strong';
  /** AI behaviour dials (see AiTuning). Each defaults to leaving the AI as designed. */
  aiAggression?: number;
  aiDiplomacy?: number;
  aiBoldness?: number;
}

/** Roster of possible nobles, human first; AI rivals fill the rest in order.
 *  Each holds a small, contiguous home cluster on the Britain map. */
const ROSTER: { id: string; name: string; personality: NoblePersonality | null; counties: string[] }[] = [
  { id: 'p1', name: 'You', personality: null, counties: ['hampshire', 'berkshire', 'wiltshire'] },
  { id: 'p2', name: 'The Bruce', personality: NoblePersonality.Baron, counties: ['midlothian', 'lanarkshire', 'fife'] },
  { id: 'p3', name: 'Llywelyn', personality: NoblePersonality.Knight, counties: ['glamorgan', 'carmarthenshire', 'breconshire'] },
  { id: 'p4', name: 'Earl of York', personality: NoblePersonality.Countess, counties: ['yorkshire', 'durham', 'lancashire'] },
  { id: 'p5', name: 'De Warenne', personality: NoblePersonality.Bishop, counties: ['norfolk', 'suffolk', 'cambridgeshire'] },
];

/** Build the GameOptions block (option flags + AI tuning) from a setup. */
function optionsFrom(setup?: GameSetup): GameOptions {
  return {
    advancedFarming: setup?.advancedFarming ?? false,
    exploration: setup?.exploration ?? false,
    difficulty: setup?.difficulty ?? 'normal',
    ai: {
      aggression: setup?.aiAggression ?? AI_TUNING_DEFAULTS.aggression,
      diplomacy: setup?.aiDiplomacy ?? AI_TUNING_DEFAULTS.diplomacy,
      boldness: setup?.aiBoldness ?? AI_TUNING_DEFAULTS.boldness,
    },
  };
}

/** Starting-county strength multipliers for the County Status setting. */
const COUNTY_STATUS_MUL: Record<'weak' | 'normal' | 'strong', number> = { weak: 0.75, normal: 1, strong: 1.3 };
/** AI economy/host multiplier by difficulty (applied to AI gold and army size). */
const DIFFICULTY_MUL: Record<Difficulty, number> = { easy: 0.6, normal: 1, hard: 1.5 };

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

/** A balanced starting retinue of `total` soldiers — a peasant levy stiffened
 *  with archers, swordsmen, a few macemen and knights (peasants absorb the
 *  rounding remainder so the parts sum exactly). */
function retinue(total: number): Partial<UnitCounts> {
  const knight = Math.round(total * 0.1);
  const maceman = Math.round(total * 0.1);
  const archer = Math.round(total * 0.2);
  const swordsman = Math.round(total * 0.2);
  const peasant = total - knight - maceman - archer - swordsman;
  return { Knight: knight, Maceman: maceman, Archer: archer, Swordsman: swordsman, Peasant: peasant };
}

/**
 * The default two-player demo: the human holds York + Lancaster (low taxes,
 * thriving), an AI baron holds the over-taxed Kent (primed to revolt). Three
 * counties in a line so immigration flows along the happiness gradient.
 */
export function createDemoWorld(setup?: GameSetup): GameState {
  const options = optionsFrom(setup);
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

  // A player army has marched into the rival's Kent and lives off its land —
  // foraging drains Kent's stores each season (demo world has no tile grid, so
  // the army's col/row are nominal; foraging keys off countyId).
  const invader = createArmy({ id: 'p1-army', ownerId: 'p1', col: 0, row: 0, countyId: 'kent', units: retinue(80) });

  return createWorld({
    realms: [player, rival],
    counties,
    armies: [invader],
    edges: [['york', 'lancaster'], ['lancaster', 'kent']],
    season: Season.Spring,
    options,
  });
}

/**
 * Great Britain: every historic county on the BRITAIN map. The human player and
 * `nobles - 1` AI rivals each begin with a small home cluster; the rest start
 * neutral, to be won by conquest. The custom-game settings (nobles, gold, army
 * size, starting castle, county status, difficulty) all flow through `setup`.
 */
export function createBritainWorld(setup?: GameSetup): GameState {
  const options = optionsFrom(setup);
  const nobles = Math.max(2, Math.min(ROSTER.length, Math.round(setup?.nobles ?? 3)));
  const startingGold = Math.max(0, Math.round(setup?.startingGold ?? 200));
  const armySize = Math.max(0, Math.round(setup?.armySize ?? 40));
  const startingCastle = setup?.startingCastle ?? CastleType.MotteAndBailey;
  const statusMul = COUNTY_STATUS_MUL[setup?.countyStatus ?? 'normal'];
  const diffMul = DIFFICULTY_MUL[options.difficulty];

  // The competing nobles (human first); each owns its home cluster.
  const roster = ROSTER.slice(0, nobles);
  const realms = roster.map((e, i) => createRealm({
    id: e.id,
    name: e.name,
    isHuman: i === 0,
    personality: e.personality ?? undefined,
    // AI coffers scale with difficulty; the human's are exactly as set.
    gold: i === 0 ? startingGold : Math.round(startingGold * diffMul),
  }));
  const starts: Record<string, string> = {};
  for (const e of roster) for (const id of e.counties) starts[id] = e.id;

  // Each county's economy is derived from the tiles it owns.
  const tileMap = buildBritainTileMap();
  const profiles = countyProfiles(tileMap);
  const towns = countyTowns(tileMap);

  // People one fully-worked grain field feeds per season (annual yield / 4).
  const peoplePerGrainField = (GRAIN_SACKS_PER_FIELD * GRAIN_YIELD_MULTIPLIER) / 4;
  // Under Advanced Farming a third of fields must lie fallow to hold fertility,
  // so provision extra fallow headroom on top of the working grain fields.
  const fallowRatio = ADVANCED_FARMING.idealFallow / (1 - ADVANCED_FARMING.idealFallow); // = 0.5
  const advanced = options.advancedFarming;
  const hasCastle = startingCastle !== CastleType.None;

  const counties = BRITAIN.regions.map((region) => {
    const ownerId = starts[region.id] ?? null;
    const p = profiles.get(region.id);

    // Bigger (more habitable) counties carry more people; a starting county's
    // strength is scaled by the County Status setting (neutral land unaffected).
    const base = 80 + (p?.passable ?? 0) * 30 + (ownerId ? 60 : 0);
    const population = Math.round(ownerId ? base * statusMul : base);
    // Give each county enough grain fields to feed its population with a surplus
    // (so it survives to its first harvest and can spare labour for industry).
    // Wheat tiles add bonus fertility; pasture tiles become cattle.
    const grainFields = Math.max(2, Math.ceil((population * FOOD_SURPLUS_TARGET) / peoplePerGrainField))
      + (p?.wheat ?? 0);
    const cattleFields = p?.pasture ?? 0;
    // Extra fields left fallow so the working third stays fertile (advanced only).
    const fallowFields = advanced ? Math.ceil(grainFields * fallowRatio) : 0;

    const county = createCounty({
      id: region.id,
      name: region.name,
      ownerId,
      happiness: ownerId ? 60 : 50,
      population,
      taxRate: 18,
      grainSacks: Math.round(population * STARTING_FOOD_SEASONS),
      cows: Math.round((cattleFields * 8) * (ownerId ? statusMul : 1)),
      fieldCount: grainFields + cattleFields + 1 + fallowFields,
      industries: {
        Lumber: (p?.wood ?? 0) > 0,
        Quarry: (p?.stone ?? 0) > 0,
        IronMine: (p?.iron ?? 0) > 0,
      },
      // A starting county holds the chosen castle (garrisoned, so it can only be
      // taken by siege); neutral counties have none and fall to a marching army.
      castle: ownerId && hasCastle ? startingCastle : undefined,
      garrison: ownerId && hasCastle
        ? Math.round(CASTLE_SPEC[startingCastle].garrison * SIEGE.startingGarrisonFraction)
        : 0,
    });

    // Tile-derived production ceilings.
    if (p && p.wood > 0) county.industries.Lumber.capacity = p.wood * WOOD_PER_TILE;
    if (p && p.stone > 0) county.industries.Quarry.capacity = p.stone * STONE_PER_TILE;
    if (p && p.iron > 0) county.industries.IronMine.capacity = p.iron * IRON_PER_TILE;

    farm(county, grainFields, cattleFields);
    return county;
  });

  // Each realm fields one army at its capital county's town (AI host scales with
  // difficulty). With armySize 0 the nobles begin without a standing army.
  const armies: Army[] = [];
  for (let i = 0; i < roster.length; i += 1) {
    const e = roster[i];
    const size = i === 0 ? armySize : Math.round(armySize * diffMul);
    const town = towns.get(e.counties[0]);
    if (town && size > 0) {
      armies.push(createArmy({ id: `${e.id}-army`, ownerId: e.id, col: town.col, row: town.row, countyId: e.counties[0], units: retinue(size) }));
    }
  }

  return createWorld({
    realms,
    counties,
    armies,
    edges: mapEdges(BRITAIN),
    season: Season.Spring,
    options,
  });
}
