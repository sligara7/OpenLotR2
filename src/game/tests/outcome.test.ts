/* Win/lose conditions — when the game is decided, and who won. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { createRng } from '../rng.ts';
import { dispatch } from '../commands/dispatch.ts';
import { advanceSeason } from '../engine.ts';
import { updateEliminations, evaluateOutcome } from '../systems/conquest.ts';
import type { County } from '../types/county.ts';

const county = (id: string, ownerId: string | null): County => createCounty({ id, name: id.toUpperCase(), ownerId });

test('outcome: ongoing while several realms share the map', () => {
  const realms = [createRealm({ id: 'p1', name: 'You', isHuman: true }), createRealm({ id: 'p2', name: 'B' }), createRealm({ id: 'p3', name: 'C' })];
  const counties = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id, i) =>
    county(id, i === 0 ? 'p1' : i === 1 ? 'p2' : i === 2 ? 'p3' : null));
  const world = createWorld({ realms, counties });
  assertEqual(evaluateOutcome(world), null, 'nobody dominates yet');
});

test('outcome: last realm standing wins', () => {
  const world = createWorld({
    realms: [createRealm({ id: 'p1', name: 'You', isHuman: true }), createRealm({ id: 'p2', name: 'Rival' })],
    counties: [county('a', 'p1'), county('b', null), county('c', null)],
  });
  updateEliminations(world); // p2 holds nothing and has no army
  assert(world.realms.p2.eliminated, 'rival is eliminated');
  const o = evaluateOutcome(world);
  assertEqual(o?.reason, 'last-standing');
  assertEqual(o?.winnerId, 'p1');
});

test('outcome: a supermajority of counties wins by conquest', () => {
  const world = createWorld({
    realms: [createRealm({ id: 'p1', name: 'You', isHuman: true }), createRealm({ id: 'p2', name: 'Rival' })],
    counties: [county('a', 'p1'), county('b', 'p1'), county('c', 'p2'), county('d', null)],
  });
  const o = evaluateOutcome(world); // p1 holds 2 of 4 = 50%
  assertEqual(o?.reason, 'conquest');
  assertEqual(o?.winnerId, 'p1');
});

test('outcome: the human being eliminated is a defeat, credited to the strongest rival', () => {
  const world = createWorld({
    realms: [
      createRealm({ id: 'p1', name: 'You', isHuman: true }),
      createRealm({ id: 'p2', name: 'Big' }), createRealm({ id: 'p3', name: 'Small' }),
    ],
    counties: [county('a', 'p2'), county('b', 'p2'), county('c', 'p3'), county('d', null), county('e', null), county('f', null)],
  });
  updateEliminations(world); // p1 holds nothing → eliminated; p2/p3 below 50%
  const o = evaluateOutcome(world);
  assertEqual(o?.reason, 'defeat');
  assertEqual(o?.winnerId, 'p2', 'the leading rival is credited');
});

test('outcome: extinction when no realm survives', () => {
  const world = createWorld({
    realms: [createRealm({ id: 'p1', name: 'You', isHuman: true }), createRealm({ id: 'p2', name: 'B' })],
    counties: [county('a', null), county('b', null)],
  });
  updateEliminations(world);
  const o = evaluateOutcome(world);
  assertEqual(o?.reason, 'extinction');
  assertEqual(o?.winnerId, null);
});

test('outcome: advanceSeason records the result, and EndTurn is then refused', () => {
  const world = createWorld({
    realms: [createRealm({ id: 'p1', name: 'You', isHuman: true }), createRealm({ id: 'p2', name: 'Rival' })],
    counties: [county('a', 'p1'), county('b', null)],
  });
  const report = advanceSeason(world, createRng(1)); // p2 has nothing → eliminated → p1 last standing
  assertEqual(report.outcome?.reason, 'last-standing');
  assertEqual(world.outcome?.winnerId, 'p1', 'outcome stored on state');

  const res = dispatch(world, { type: 'EndTurn' }, { actorRealmId: 'p1', rng: createRng(2) });
  assert(!res.ok, 'cannot end the turn once the game is over');
});
