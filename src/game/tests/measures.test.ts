/*
 * The balance harness is an instrument, and an instrument that lies is worse
 * than none: every rules change is judged by these numbers.
 *
 * The bug these guard against was live and shipping. `seenSieges` was a set of
 * county ids kept for the WHOLE GAME, so a county besieged, taken, and besieged
 * again counted ONE siege started while every capture still counted a win.
 * Measured across twenty games it reported 34 sieges won against 16 laid — an
 * impossible pair that nobody noticed because both numbers looked plausible
 * alone.
 */

import { test, assertEqual } from '../testing/harness.ts';
import { emptyTally, tallyTurn } from '../balance/measures.ts';
import { createBritainWorld } from '../scenarios.ts';
import type { GameState } from '../types/realm.ts';
import type { TurnReport } from '../engine.ts';
import type { SiegeOutcome } from '../systems/siege.ts';

/** A turn report carrying nothing but the given siege outcomes. */
function reportWith(sieges: SiegeOutcome[], turn = 1): TurnReport {
  return {
    turn,
    year: 1,
    season: 'Spring',
    counties: [],
    migration: {},
    convoys: { convoys: [] },
    forage: { armies: [] },
    siege: { sieges },
    wages: { realms: [] },
    garrisons: [],
    capitulations: [],
    diplomacy: { expiredProposals: [], expiredRequests: [] },
    outcome: null,
  } as unknown as TurnReport;
}

function siegeOn(countyId: string, over: Partial<SiegeOutcome> = {}): SiegeOutcome {
  return {
    countyId,
    attackerRealmId: 'p1',
    besiegerArmyId: 'a1',
    progress: 0,
    seasons: 1,
    garrison: 10,
    garrisonStarved: 0,
    status: 'ongoing',
    captured: false,
    ...over,
  };
}

/** A world with `standing` counties currently under siege in live state. */
function worldWithSieges(standing: string[]): { w: GameState; ids: string[] } {
  const w = createBritainWorld();
  const ids = Object.keys(w.counties).sort().slice(0, 3);
  w.sieges = {};
  for (const id of standing) {
    w.sieges[id] = {
      countyId: id, attackerRealmId: 'p1', besiegerArmyId: 'a1',
      engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
    };
  }
  return { w, ids };
}

test('measures: a siege running for several seasons is counted once', () => {
  const tally = emptyTally();
  const { w, ids } = worldWithSieges([]);
  const id = ids[0];
  w.sieges[id] = {
    countyId: id, attackerRealmId: 'p1', besiegerArmyId: 'a1',
    engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
  };

  for (let t = 1; t <= 4; t += 1) tallyTurn(tally, w, reportWith([siegeOn(id)], t));

  assertEqual(tally.siegesStarted, 1, 'one siege, however many seasons it lasts');
});

test('measures: the same county besieged twice counts as two sieges', () => {
  const tally = emptyTally();
  const { w, ids } = worldWithSieges([]);
  const id = ids[0];

  // First siege: stands one season, then the walls are stormed.
  w.sieges[id] = {
    countyId: id, attackerRealmId: 'p1', besiegerArmyId: 'a1',
    engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
  };
  tallyTurn(tally, w, reportWith([siegeOn(id)], 1));
  delete w.sieges[id]; // captureCounty clears it
  tallyTurn(tally, w, reportWith([siegeOn(id, { status: 'stormed', captured: true })], 2));

  // Later the county is fought over again.
  w.sieges[id] = {
    countyId: id, attackerRealmId: 'p2', besiegerArmyId: 'a2',
    engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
  };
  tallyTurn(tally, w, reportWith([siegeOn(id, { attackerRealmId: 'p2' })], 9));

  assertEqual(tally.siegesStarted, 2, 'a county fought over twice is two sieges');
  assertEqual(tally.siegesWon, 1, 'and only one of them has been won so far');
});

test('measures: wins never exceed sieges laid — the invariant that was violated', () => {
  const tally = emptyTally();
  const { w, ids } = worldWithSieges([]);
  const id = ids[0];

  // Five separate sieges of the same county, each won. The old lifetime-keyed
  // set reported 1 laid against 5 won.
  for (let round = 0; round < 5; round += 1) {
    w.sieges[id] = {
      countyId: id, attackerRealmId: 'p1', besiegerArmyId: 'a1',
      engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
    };
    tallyTurn(tally, w, reportWith([siegeOn(id)], round * 2 + 1));
    delete w.sieges[id];
    tallyTurn(tally, w, reportWith([siegeOn(id, { status: 'starved', captured: true })], round * 2 + 2));
  }

  assertEqual(tally.siegesStarted, 5, 'five sieges laid');
  assertEqual(tally.siegesWon, 5, 'five won');
  assertEqual(
    tally.siegesWon <= tally.siegesStarted,
    true,
    'a siege cannot be won without being laid',
  );
});

test('measures: a siege ended by the besieger dying is still ended', () => {
  const tally = emptyTally();
  const { w, ids } = worldWithSieges([]);
  const id = ids[0];

  // A repulsed assault that wiped out the besieging army clears the siege from
  // live state while the ledger entry reads `repulsed`, `captured: false` —
  // indistinguishable from an ordinary failed storm by status alone. Reading
  // live state is what makes the next siege here count as new.
  w.sieges[id] = {
    countyId: id, attackerRealmId: 'p1', besiegerArmyId: 'a1',
    engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
  };
  tallyTurn(tally, w, reportWith([siegeOn(id)], 1));
  delete w.sieges[id];
  tallyTurn(tally, w, reportWith([siegeOn(id, { status: 'repulsed' })], 2));

  w.sieges[id] = {
    countyId: id, attackerRealmId: 'p2', besiegerArmyId: 'a5',
    engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
  };
  tallyTurn(tally, w, reportWith([siegeOn(id, { attackerRealmId: 'p2' })], 5));

  assertEqual(tally.siegesStarted, 2, 'the second attempt is a second siege');
});

test('measures: two counties besieged at once are two sieges', () => {
  const tally = emptyTally();
  const { w, ids } = worldWithSieges([]);
  for (const id of ids.slice(0, 2)) {
    w.sieges[id] = {
      countyId: id, attackerRealmId: 'p1', besiegerArmyId: 'a1',
      engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
    };
  }

  tallyTurn(tally, w, reportWith([siegeOn(ids[0]), siegeOn(ids[1])], 1));

  assertEqual(tally.siegesStarted, 2, 'counted per county, not per turn');
});
