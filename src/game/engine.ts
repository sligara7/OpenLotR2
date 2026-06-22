/*
 * Season engine — the turn orchestrator.
 *
 * advanceSeason() runs the per-county pipeline in the order the manual implies,
 * then resolves world-level immigration, then ticks the calendar:
 *
 *   labour -> production -> food -> health -> happiness -> taxes -> population
 *   -> revolt          (per county)
 *   -> immigration     (world)
 *   -> foraging        (world: armies eat the county they occupy, or starve)
 *   -> calendar tick
 *
 * Taxes are collected before population changes (Manual Part-3 "Taxes"); ration
 * drives health, and health feeds happiness, so those run in that sequence.
 * The function is deterministic given the same state + RNG.
 */

import { SEASON_ORDER, Season } from './types/enums.ts';
import type { GameState } from './types/realm.ts';
import type { County } from './types/county.ts';
import type { Rng } from './rng.ts';
import type { Treasury } from './types/realm.ts';

import { allocateLabour } from './systems/labour.ts';
import { runProduction } from './systems/production.ts';
import { advanceFarming } from './systems/farming.ts';
import { feedPopulation } from './systems/food.ts';
import { updateHealth } from './systems/health.ts';
import { updateHappiness } from './systems/happiness.ts';
import { collectTaxes } from './systems/taxes.ts';
import { updatePopulation } from './systems/population.ts';
import { updateRevolt } from './systems/revolt.ts';
import { runImmigration } from './systems/immigration.ts';
import type { MigrationLedger } from './systems/immigration.ts';
import { forageArmies } from './systems/foraging.ts';
import type { ForageLedger } from './systems/foraging.ts';
import { advanceConvoys } from './systems/convoys.ts';
import type { ConvoyLedger } from './systems/convoys.ts';
import { advanceSieges } from './systems/siege.ts';
import type { SiegeLedger } from './systems/siege.ts';
import { armyMovementAllowance } from './state/army.ts';
import { updateEliminations, evaluateOutcome } from './systems/conquest.ts';
import { payWages } from './systems/wages.ts';
import type { WagesLedger } from './systems/wages.ts';
import { runDiplomacy } from './systems/diplomacy.ts';
import type { DiplomacyLedger } from './systems/diplomacy.ts';
import type { GameOutcome } from './types/realm.ts';

export interface CountyTurnReport {
  countyId: string;
  population: number;
  happiness: number;
  health: number;
  achievedRation: string;
  taxGold: number;
  births: number;
  deaths: number;
  emigrants: number;
  plague: boolean;
  revoltTriggered: boolean;
  castleCompleted: boolean;
}

export interface TurnReport {
  turn: number;
  year: number;
  season: Season;
  counties: CountyTurnReport[];
  migration: MigrationLedger;
  convoys: ConvoyLedger;
  forage: ForageLedger;
  siege: SiegeLedger;
  wages: WagesLedger;
  diplomacy: DiplomacyLedger;
  /** Set the turn the game is decided; null while it continues. */
  outcome: GameOutcome | null;
}

const scratchTreasury = (): Treasury => ({ gold: 0, wood: 0, stone: 0, iron: 0, weapons: {} });

function processCounty(state: GameState, county: County, rng: Rng): CountyTurnReport {
  const realm = county.ownerId ? state.realms[county.ownerId] : undefined;
  const treasury = realm ? realm.treasury : scratchTreasury();
  const season = state.season;
  const advanced = state.options?.advancedFarming ?? false;

  // Advanced Farming: set this season's weather and ease fertility before the
  // harvest is worked out.
  if (advanced) advanceFarming(county, rng);
  const alloc = allocateLabour(county);
  const prod = runProduction(county, alloc, treasury, season, advanced);
  const food = feedPopulation(county, prod.dairyPortions);
  const health = updateHealth(county, food.achievedRation, rng);
  updateHappiness(county);
  const taxGold = collectTaxes(county, realm);
  const pop = updatePopulation(county, rng);
  const revolt = updateRevolt(county);

  // End-of-season housekeeping for transient modifiers.
  if (county.aleSeasons > 0) county.aleSeasons -= 1;
  county.recentConscription = 0;

  return {
    countyId: county.id,
    population: county.population,
    happiness: Math.round(county.happiness),
    health: Math.round(county.health),
    achievedRation: food.achievedRation,
    taxGold: Math.round(taxGold),
    births: pop.births,
    deaths: pop.deaths + health.plagueDeaths,
    emigrants: pop.emigrants,
    plague: health.plague,
    revoltTriggered: revolt.revoltTriggered,
    castleCompleted: prod.castleCompleted,
  };
}

function nextCalendar(state: GameState): void {
  const i = SEASON_ORDER.indexOf(state.season);
  const next = SEASON_ORDER[(i + 1) % SEASON_ORDER.length];
  if (state.season === Season.Winter) state.year += 1;
  state.season = next;
  state.turn += 1;
}

export function advanceSeason(state: GameState, rng: Rng): TurnReport {
  const reports: CountyTurnReport[] = [];
  for (const county of Object.values(state.counties)) {
    reports.push(processCounty(state, county, rng));
  }
  const migration = runImmigration(state);
  // Supply convoys roll in before foraging, so freshly delivered food can be
  // eaten this same season.
  const convoys = advanceConvoys(state);
  // Armies forage last: counties have already fed their own people, so an army
  // draws down whatever the occupied county has left in store (and starves if
  // that is not enough).
  const forage = forageArmies(state);
  // Sieges resolve after foraging, so a besieger that has stripped the county
  // starves its garrison this same season.
  const siege = advanceSieges(state, rng);
  // Upkeep: pay army wages from the (now tax-funded) treasuries; unpaid troops
  // desert. Runs after the fighting so survivors are what gets paid.
  const wages = payWages(state);
  // Fresh movement budget for every surviving army next turn.
  for (const army of Object.values(state.armies)) army.movement = armyMovementAllowance(army);

  // Relations cool toward neutral (allies warm), stale offers lapse.
  const diplomacy = runDiplomacy(state);

  // Settle eliminations from this turn's fighting, then check for a winner.
  updateEliminations(state);
  state.outcome = evaluateOutcome(state);

  const report: TurnReport = {
    turn: state.turn,
    year: state.year,
    season: state.season,
    counties: reports,
    migration,
    convoys,
    forage,
    siege,
    wages,
    diplomacy,
    outcome: state.outcome,
  };
  nextCalendar(state);
  return report;
}
