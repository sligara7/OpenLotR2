/* Ferries — sailing armies across sea crossings to reach isolated counties. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { buildBritainTileMap, countyTowns, isFerryLink } from '../maps/index.ts';

const ctx = { actorRealmId: 'p1' };
const town = (id: string) => countyTowns(buildBritainTileMap()).get(id)!;

test('ferry: only genuinely sea-separated counties need a boat', () => {
  // Anglesey is the one true island county: the Menai Strait is real water, and
  // narrow enough that the tile map has to carry it deliberately (see STRAITS).
  assert(isFerryLink('anglesey', 'caernarfonshire'), 'Anglesey is reached by sea');

  // These three were ferry links only because the OLD map drew counties as
  // Voronoi blobs that failed to touch. All three share long land borders in
  // reality — the Tamar, the Ord of Caithness, the head of the Gare Loch — and
  // the coastline-derived map now joins them by land, as it should.
  assert(!isFerryLink('cornwall', 'devon'), 'Cornwall borders Devon by land');
  assert(!isFerryLink('caithness', 'sutherland'), 'Caithness borders Sutherland by land');
  assert(!isFerryLink('argyll', 'dunbartonshire'), 'Argyll borders Dunbartonshire by land');

  assert(!isFerryLink('hampshire', 'berkshire'), 'ordinary land neighbours are not ferry links');
});

test('ferry: an army sails a sea crossing and captures the island county', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army'];
  // Station it in Caernarfonshire, sea-adjacent to neutral Anglesey.
  const caernarfon = town('caernarfonshire');
  army.col = caernarfon.col; army.row = caernarfon.row;
  army.countyId = 'caernarfonshire'; army.movement = 5;

  const res = dispatch(world, { type: 'FerryArmy', armyId: 'p1-army', toCountyId: 'anglesey' }, ctx);
  assert(res.ok, 'the crossing was made');
  const anglesey = town('anglesey');
  assertEqual(`${army.col},${army.row}`, `${anglesey.col},${anglesey.row}`, 'landed at Anglesey town');
  assertEqual(army.countyId, 'anglesey', 'now occupies Anglesey');
  assertEqual(army.movement, 0, 'the voyage took the whole turn');
  assertEqual(world.counties.anglesey.ownerId, 'p1', 'undefended Anglesey taken on landing');
});

test('ferry: refused without a sea link, or with no movement left', () => {
  const world = createBritainWorld();
  const army = world.armies['p1-army']; // starts inland in Hampshire
  assert(!dispatch(world, { type: 'FerryArmy', armyId: 'p1-army', toCountyId: 'anglesey' }, ctx).ok,
    'Hampshire has no ferry route to Anglesey');

  const caernarfon = town('caernarfonshire');
  army.col = caernarfon.col; army.row = caernarfon.row;
  army.countyId = 'caernarfonshire'; army.movement = 0;
  assert(!dispatch(world, { type: 'FerryArmy', armyId: 'p1-army', toCountyId: 'anglesey' }, ctx).ok,
    'an exhausted army cannot sail');
});
