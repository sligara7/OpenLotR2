/* Holding what you take — a captured county is garrisoned from the taking army. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createBritainWorld } from '../scenarios.ts';
import { captureCounty } from '../systems/conquest.ts';
import { createArmy } from '../state/army.ts';
import { CastleType } from '../types/enums.ts';
import { GARRISON_ON_CAPTURE, CASTLE_SPEC, MIN_ARMY_SIZE, WATCH_ON_CAPTURE } from '../constants.ts';

function world() {
  const w = createBritainWorld();
  const target = Object.values(w.counties).find((c) => !c.ownerId)!;
  return { w, target };
}

test('permanence: taking a castle installs a garrison from the taking army', () => {
  const { w, target } = world();
  target.castle.type = CastleType.NormanKeep;
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: target.id, soldiers: 400 });
  w.armies.a = army;

  captureCounty(w, target.id, 'p1', 'a');

  const wanted = Math.round(CASTLE_SPEC[CastleType.NormanKeep].garrison * GARRISON_ON_CAPTURE);
  assertEqual(target.castle.garrison, wanted, 'the walls are manned');
  assertEqual(army.soldiers, 400 - wanted, 'and the men came out of the army');
  assertEqual(target.ownerId, 'p1', 'the county changed hands');
});

test('permanence: a county without walls still gets a watch', () => {
  const { w, target } = world();
  target.castle.type = CastleType.None;
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: target.id, soldiers: 300 });
  w.armies.a = army;

  captureCounty(w, target.id, 'p1', 'a');
  assertEqual(target.castle.garrison, WATCH_ON_CAPTURE, 'a watch holds the town');
  assertEqual(army.soldiers, 300 - WATCH_ON_CAPTURE, 'drawn from the army');
});

test('permanence: an army too small to spare anyone takes but cannot hold', () => {
  const { w, target } = world();
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: target.id, soldiers: MIN_ARMY_SIZE });
  w.armies.a = army;

  captureCounty(w, target.id, 'p1', 'a');
  assertEqual(target.castle.garrison, 0, 'nobody could be left behind');
  assertEqual(army.soldiers, MIN_ARMY_SIZE, 'and the army was not dissolved to do it');
  assertEqual(target.ownerId, 'p1', 'the county is still taken — holding it is the gamble');
});

test('permanence: a captain leaves levies at the gate and keeps his knights', () => {
  const { w, target } = world();
  target.castle.type = CastleType.None;
  const army = createArmy({
    id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: target.id,
    units: { Peasant: 100, Knight: 40 },
  });
  w.armies.a = army;

  captureCounty(w, target.id, 'p1', 'a');
  assertEqual(army.units.Knight, 40, 'the knights ride on');
  assertEqual(army.units.Peasant, 100 - WATCH_ON_CAPTURE, 'the levies hold the gate');
});

test('permanence: a county taken with no army named keeps the old behaviour', () => {
  const { w, target } = world();
  target.castle.type = CastleType.NormanKeep;
  target.castle.garrison = 50;
  captureCounty(w, target.id, 'p1');
  assertEqual(target.castle.garrison, 0, 'the defeated garrison is gone and nobody replaced it');
});
