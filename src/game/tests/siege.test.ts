/* Sieges — multi-season investment of a garrisoned castle (storm or starve). */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { createRng } from '../rng.ts';
import { dispatch } from '../commands/dispatch.ts';
import { advanceSieges } from '../systems/siege.ts';
import { CastleType } from '../types/enums.ts';
import type { Army } from '../types/army.ts';
import type { GameState } from '../types/realm.ts';

/** A besieger (p1) occupying p2's garrisoned castle county. */
function siegeWorld(opts: { soldiers: number; garrison: number; grainSacks: number; castle?: CastleType }): GameState {
  const p1 = createRealm({ id: 'p1', name: 'Attacker', isHuman: true });
  const p2 = createRealm({ id: 'p2', name: 'Defender' });
  const target = createCounty({
    id: 'castle', name: 'Castle', ownerId: 'p2', population: 100,
    castle: opts.castle ?? CastleType.MotteAndBailey, garrison: opts.garrison, grainSacks: opts.grainSacks,
  });
  const army: Army = { id: 'a', ownerId: 'p1', col: 1, row: 1, countyId: 'castle', soldiers: opts.soldiers };
  return createWorld({ realms: [p1, p2], counties: [target], armies: [army] });
}

const lay = (state: GameState) =>
  dispatch(state, { type: 'LaySiege', armyId: 'a', countyId: 'castle' }, { actorRealmId: 'p1' });

test('siege: LaySiege requires occupying a hostile, garrisoned county', () => {
  const world = siegeWorld({ soldiers: 80, garrison: 20, grainSacks: 500 });
  assert(lay(world).ok, 'valid siege accepted');
  assert(!!world.sieges['castle'], 'a siege record exists');

  // Own county / undefended county are both rejected.
  world.counties['castle'].ownerId = 'p1';
  assert(!lay(world).ok, 'cannot besiege your own county');
  world.counties['castle'].ownerId = 'p2';
  world.counties['castle'].castle.garrison = 0;
  assert(!lay(world).ok, 'undefended castle is not a siege target');
});

test('siege: a large army storms the walls and captures the county', () => {
  const world = siegeWorld({ soldiers: 300, garrison: 20, grainSacks: 5000 }); // well-fed garrison
  lay(world);
  let captured = false;
  for (let i = 0; i < 12 && !captured; i++) {
    const ledger = advanceSieges(world, createRng(100 + i));
    captured = ledger.sieges[0]?.captured ?? false;
  }
  assert(captured, 'the castle eventually falls to assault');
  assertEqual(world.counties['castle'].ownerId, 'p1', 'county is conquered');
  assert(!world.sieges['castle'], 'siege record cleared on capture');
  assertGreater(world.counties['castle'].castle.damage, 0, 'the walls were battered');
});

test('siege: a stripped county starves the garrison into surrender', () => {
  // A tiny blockading force can never storm a strong castle's walls — but with
  // the county's stores gone, the garrison starves and the castle surrenders.
  const world = siegeWorld({ soldiers: 3, garrison: 40, grainSacks: 0, castle: CastleType.StoneCastle });
  world.counties['castle'].food.cows = 0;
  lay(world);
  let status = 'ongoing';
  for (let i = 0; i < 15 && status !== 'starved'; i++) {
    status = advanceSieges(world, createRng(i)).sieges[0]?.status ?? 'lifted';
    if (status === 'lifted') break;
  }
  assertEqual(status, 'starved', 'the garrison is starved out');
  assertEqual(world.counties['castle'].ownerId, 'p1', 'the starved castle is taken');
});

test('siege: marching the besieger away lifts the siege', () => {
  const world = siegeWorld({ soldiers: 80, garrison: 20, grainSacks: 500 });
  lay(world);
  world.armies['a'].countyId = 'elsewhere'; // the army has moved off
  const ledger = advanceSieges(world, createRng(1));
  assertEqual(ledger.sieges[0]?.status, 'lifted', 'siege reported lifted');
  assert(!world.sieges['castle'], 'siege record removed');
  assertEqual(world.counties['castle'].ownerId, 'p2', 'county stays with the defender');
});
