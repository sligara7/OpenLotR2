/*
 * Conquest that pays for itself: settled counties give their soldiers back, and
 * a beaten realm sues for terms instead of being hunted acre by acre.
 */

import { CAPITULATION, CONQUEST, GARRISON, WATCH_ON_CAPTURE } from '../constants.ts';
import { settleGarrisons } from '../systems/garrisons.ts';
import { captureCounty, updateCapitulations } from '../systems/conquest.ts';
import { UnitType } from '../types/enums.ts';
import { createArmy } from '../state/army.ts';
import { createBritainWorld, createDemoWorld } from '../scenarios.ts';
import { assert, assertEqual, assertGreater, test } from '../testing/harness.ts';
import type { GameState } from '../types/realm.ts';

/** A world where `countyId` is held, content, and garrisoned above the watch. */
function settledWorld(garrison: number, happiness = 90): { w: GameState; id: string } {
  const w = createDemoWorld();
  const id = Object.keys(w.counties)[0];
  const county = w.counties[id];
  county.ownerId = 'p1';
  county.happiness = happiness;
  county.pacifiedSeasons = 0;
  county.revolting = false;
  county.castle.garrison = garrison;
  return { w, id };
}

test('a settled county stands surplus garrison down toward a watch', () => {
  const { w, id } = settledWorld(WATCH_ON_CAPTURE + 12);
  const before = w.counties[id].castle.garrison;

  settleGarrisons(w);

  assertEqual(
    w.counties[id].castle.garrison,
    before - GARRISON.releasePerSeason,
    'the walls give up a season s worth of men',
  );
});

test('the release stops at the watch and never goes below it', () => {
  const { w, id } = settledWorld(WATCH_ON_CAPTURE + 2);

  settleGarrisons(w);
  settleGarrisons(w);
  settleGarrisons(w);

  assertEqual(w.counties[id].castle.garrison, WATCH_ON_CAPTURE, 'a watch on the town remains');
});

test('freed men rejoin an army standing in the county', () => {
  const { w, id } = settledWorld(WATCH_ON_CAPTURE + 20);
  w.armies['a1'] = createArmy({
    id: 'a1', ownerId: 'p1', col: 0, row: 0, countyId: id,
    units: { [UnitType.Peasant]: 60 },
  });
  const before = w.armies['a1'].soldiers;

  const ledger = settleGarrisons(w);

  assertEqual(w.armies['a1'].soldiers, before + GARRISON.releasePerSeason, 'the army is stronger');
  assertEqual(ledger[0].toArmyId, 'a1', 'and the ledger says where they went');
});

test('with no army present the men go home to the county', () => {
  const { w, id } = settledWorld(WATCH_ON_CAPTURE + 20);
  const before = w.counties[id].population;

  const entry = settleGarrisons(w).find((e) => e.countyId === id)!;

  assertEqual(entry.toArmyId, null, 'nobody to join');
  assertEqual(
    w.counties[id].population,
    before + GARRISON.releasePerSeason,
    'so they are back in the population, conscriptable again',
  );
});

test('a sullen county keeps every man on its walls', () => {
  const { w, id } = settledWorld(WATCH_ON_CAPTURE + 30, GARRISON.settledHappiness - 1);
  const before = w.counties[id].castle.garrison;

  settleGarrisons(w);

  assertEqual(w.counties[id].castle.garrison, before, 'holding an unwilling county still costs');
});

test('a freshly conquered county is not settled, however strong its walls', () => {
  const w = createDemoWorld();
  const id = Object.keys(w.counties)[0];
  w.counties[id].castle.garrison = WATCH_ON_CAPTURE + 40;
  captureCounty(w, id, 'p1');
  w.counties[id].happiness = 90; // even if the people were somehow content
  const before = w.counties[id].castle.garrison;

  settleGarrisons(w);

  assertGreater(w.counties[id].pacifiedSeasons, 0, 'occupation is still running');
  assertEqual(w.counties[id].castle.garrison, before, 'and nothing stands down under occupation');
});

test('a county under siege keeps its walls manned', () => {
  const { w, id } = settledWorld(WATCH_ON_CAPTURE + 30);
  w.sieges[id] = {
    countyId: id, attackerRealmId: 'p2', besiegerArmyId: 'a9',
    engines: { catapults: 0, rams: 0, towers: 0 }, progress: 0, seasons: 1,
  };
  const before = w.counties[id].castle.garrison;

  settleGarrisons(w);

  assertEqual(w.counties[id].castle.garrison, before, 'nobody stands down with an army outside');
});

// --- Capitulation ---------------------------------------------------------

/*
 * Capitulation is about SHARE OF THE MAP, so these run on Britain's 82 counties
 * rather than the handful in the demo world — on a four-county map two counties
 * is half of everything, and the rule correctly refuses to call that beaten.
 */

/** A Britain world with every county given to `owner` and `n` to `loser`. */
function britainSplit(owner: string, loser: string, n: number) {
  const w = createBritainWorld();
  for (const r of Object.values(w.realms)) r.isHuman = false;
  for (const a of Object.values(w.armies)) delete w.armies[a.id];
  const ids = Object.keys(w.counties).sort();
  for (const id of ids) w.counties[id].ownerId = owner;
  const lost = ids.slice(0, n);
  for (const id of lost) w.counties[id].ownerId = loser;
  return { w, lost };
}

test('a realm down to nothing with no army sues for terms', () => {
  const { w, lost } = britainSplit('p1', 'p2', 1);
  const held = lost;
  w.armies['a1'] = createArmy({
    id: 'a1', ownerId: 'p1', col: 0, row: 0, countyId: null,
    units: { [UnitType.Peasant]: 400 },
  });

  const ledger = updateCapitulations(w);

  assertEqual(ledger.length, 1, 'one realm submitted');
  assertEqual(ledger[0].realmId, 'p2', 'the beaten one');
  assertEqual(ledger[0].toRealmId, 'p1', 'to the realm that pressed it');
  assertEqual(w.counties[held[0]].ownerId, 'p1', 'and its land changed hands');
});

test('a realm still holding a real share of the map never folds on ratios', () => {
  const total = Object.keys(createBritainWorld().counties).length;
  const keep = Math.ceil(total * CAPITULATION.hopelessShare) + 1;
  const { w } = britainSplit('p1', 'p2', keep);

  assertEqual(updateCapitulations(w).length, 0, 'an even contest is fought, not conceded');
});

test('an army in the field is a reason to fight on', () => {
  const { w } = britainSplit('p1', 'p2', 1);
  w.armies['a1'] = createArmy({
    id: 'a1', ownerId: 'p1', col: 0, row: 0, countyId: null,
    units: { [UnitType.Peasant]: 300 },
  });
  w.armies['a2'] = createArmy({
    id: 'a2', ownerId: 'p2', col: 1, row: 1, countyId: null,
    units: { [UnitType.Peasant]: 200 },
  });

  assertEqual(updateCapitulations(w).length, 0, 'a realm with men left does not submit');
});

test('the human player is never surrendered on its behalf', () => {
  const humanId = Object.values(createBritainWorld().realms).find((r) => r.isHuman)!.id;
  const other = humanId === 'p1' ? 'p2' : 'p1';
  const { w } = britainSplit(other, humanId, 1);
  w.realms[humanId].isHuman = true; // britainSplit clears the seat; put it back
  w.armies['a1'] = createArmy({
    id: 'a1', ownerId: other, col: 0, row: 0, countyId: null,
    units: { [UnitType.Peasant]: 400 },
  });

  assert(!!w.realms[humanId], 'the world has a human seat');
  assertEqual(updateCapitulations(w).length, 0, 'surrender stays the player s decision');
});

test('conquest still caps a taken county s happiness, so it is not settled at once', () => {
  const w = createDemoWorld();
  const id = Object.keys(w.counties)[0];
  w.counties[id].happiness = 95;
  captureCounty(w, id, 'p1');

  assert(
    w.counties[id].happiness <= CONQUEST.conqueredHappiness,
    'a conquered people resent their new lord',
  );
  assert(
    CONQUEST.conqueredHappiness < GARRISON.settledHappiness,
    'and that is below the bar for standing men down, so conquest costs until they are won over',
  );
});
