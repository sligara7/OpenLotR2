/* Ferries — sailing armies across sea crossings to reach isolated counties. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { buildBritainTileMap, countyTowns, isFerryLink } from '../maps/index.ts';

const ctx = { actorRealmId: 'p1' };
const town = (id: string) => countyTowns(buildBritainTileMap()).get(id)!;

test('ferry: sea-isolated counties have a ferry route, land neighbours do not', () => {
  assert(isFerryLink('cornwall', 'devon'), 'Cornwall reaches Devon by sea');
  assert(isFerryLink('caithness', 'sutherland'), 'Caithness reaches Sutherland by sea');
  assert(isFerryLink('argyll', 'dunbartonshire'), 'Argyll reaches the mainland by sea');
  assert(!isFerryLink('hampshire', 'berkshire'), 'land neighbours are not ferry links');
});

test('ferry: an army sails a sea crossing and captures the island county', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army'];
  // Station it in Devon (mainland), sea-adjacent to neutral Cornwall.
  const devon = town('devon');
  army.col = devon.col; army.row = devon.row; army.countyId = 'devon'; army.movement = 5;

  const res = dispatch(world, { type: 'FerryArmy', armyId: 'p1-army', toCountyId: 'cornwall' }, ctx);
  assert(res.ok, 'the crossing was made');
  const cornwall = town('cornwall');
  assertEqual(`${army.col},${army.row}`, `${cornwall.col},${cornwall.row}`, 'landed at Cornwall town');
  assertEqual(army.countyId, 'cornwall', 'now occupies Cornwall');
  assertEqual(army.movement, 0, 'the voyage took the whole turn');
  assertEqual(world.counties.cornwall.ownerId, 'p1', 'undefended Cornwall taken on landing');
});

test('ferry: refused without a sea link, or with no movement left', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army']; // starts inland in Hampshire
  assert(!dispatch(world, { type: 'FerryArmy', armyId: 'p1-army', toCountyId: 'cornwall' }, ctx).ok,
    'Hampshire has no ferry route to Cornwall');

  const devon = town('devon');
  army.col = devon.col; army.row = devon.row; army.countyId = 'devon'; army.movement = 0;
  assert(!dispatch(world, { type: 'FerryArmy', armyId: 'p1-army', toCountyId: 'cornwall' }, ctx).ok,
    'an exhausted army cannot sail');
});
