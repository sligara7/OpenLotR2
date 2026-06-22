/* Combat — combined-arms field battles, matchups, army attacks, and capture. */

import { test, assert, assertEqual, assertGreater, assertLess } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { createArmy, unitsOf } from '../state/army.ts';
import { createRng } from '../rng.ts';
import { resolveBattle } from '../systems/combat.ts';
import { captureOnOccupy } from '../commands/handlers/combat.ts';
import { dispatch } from '../commands/dispatch.ts';
import { CastleType } from '../types/enums.ts';
import { CONQUEST } from '../constants.ts';
import type { UnitCounts } from '../types/army.ts';

const rng = () => createRng(42);
const force = (u: Partial<UnitCounts>, modifier?: number) => ({ units: unitsOf(u), modifier });

// --- Raw resolution -------------------------------------------------------

test('combat: a much larger force annihilates a small one and survives', () => {
  const r = resolveBattle(force({ Peasant: 100 }), force({ Peasant: 15 }), rng());
  assert(r.defenderDestroyed, 'small defender wiped out');
  assert(!r.attackerDestroyed, 'big attacker survives');
  assertEqual(r.winner, 'attacker', 'attacker holds the field');
  assertGreater(r.attacker.survivors, 60, 'attacker keeps most of its strength');
});

test('combat: an even fight bloodies both sides heavily', () => {
  const r = resolveBattle(force({ Peasant: 100 }), force({ Peasant: 100 }), rng());
  assertGreater(r.attacker.casualties, 40, 'attacker takes heavy losses');
  assertGreater(r.defender.casualties, 40, 'defender takes heavy losses');
});

test('combat: a defensive modifier (castle walls) can swing an even fight', () => {
  const r = resolveBattle(force({ Peasant: 100 }), force({ Peasant: 100 }, 3), rng());
  assertEqual(r.winner, 'defender', 'the fortified side wins');
  assertGreater(r.attacker.casualties, r.defender.casualties, 'attacker bleeds more');
});

// --- The rock-paper-scissors spine (Manual Part-4 matchups) ---------------

test('combat: archers shred an equal peasant levy', () => {
  const r = resolveBattle(force({ Archer: 50 }), force({ Peasant: 50 }), rng());
  assertEqual(r.winner, 'attacker', 'archers win');
  assertGreater(r.defender.casualties, r.attacker.casualties * 2, 'peasants die far faster');
});

test('combat: crossbows punch through an equal force of knights', () => {
  const r = resolveBattle(force({ Crossbowman: 40 }), force({ Knight: 40 }), rng());
  assertEqual(r.winner, 'attacker', 'crossbows fell the knights');
});

test('combat: knights crush an equal force of swordsmen (but xbows beat knights)', () => {
  const r = resolveBattle(force({ Knight: 40 }), force({ Swordsman: 40 }), rng());
  assertEqual(r.winner, 'attacker', 'knights overpower swordsmen — completing the triangle');
});

test('combat: macemen run down an equal force of archers', () => {
  const r = resolveBattle(force({ Maceman: 40 }), force({ Archer: 40 }), rng());
  assertEqual(r.winner, 'attacker', 'macemen close and beat the archers');
});

test('combat: a unit takes far more casualties from its counter than from a poor matchup', () => {
  // Same defender (40 knights), same seed — only the attacker's type differs.
  // Crossbows counter knights (1.8x); archers glance off plate (0.4x).
  const vsCrossbows = resolveBattle(force({ Crossbowman: 40 }), force({ Knight: 40 }), createRng(5));
  const vsArchers = resolveBattle(force({ Archer: 40 }), force({ Knight: 40 }), createRng(5));
  assertGreater(vsCrossbows.defender.casualties, vsArchers.defender.casualties * 2,
    'crossbows devastate the knights archers can barely scratch');
});

// --- Army attacks & capture ----------------------------------------------

function twoArmyWorld(aSoldiers: number, bSoldiers: number) {
  const p1 = createRealm({ id: 'p1', name: 'A', isHuman: true });
  const p2 = createRealm({ id: 'p2', name: 'B' });
  const home = createCounty({ id: 'home', name: 'Home', ownerId: 'p1' });
  const a = createArmy({ id: 'a', ownerId: 'p1', col: 2, row: 2, countyId: 'home', soldiers: aSoldiers });
  const b = createArmy({ id: 'b', ownerId: 'p2', col: 2, row: 2, countyId: 'home', soldiers: bSoldiers });
  return createWorld({ realms: [p1, p2], counties: [home], armies: [a, b] });
}

test('combat: AttackArmy resolves a battle and eliminates a wiped-out realm', () => {
  const world = twoArmyWorld(120, 12);
  const res = dispatch(world, { type: 'AttackArmy', armyId: 'a', targetArmyId: 'b' },
    { actorRealmId: 'p1', rng: createRng(7) });
  assert(res.ok, 'attack accepted');
  assert(!world.armies['b'], 'the enemy army is destroyed');
  assert(world.realms['p2'].eliminated, 'a realm with nothing left is eliminated');
  assert(!world.realms['p1'].eliminated, 'the victor lives on');
});

test('combat: AttackArmy refuses your own army and out-of-reach targets', () => {
  const world = twoArmyWorld(50, 50);
  assert(!dispatch(world, { type: 'AttackArmy', armyId: 'a', targetArmyId: 'a' },
    { actorRealmId: 'p1', rng: rng() }).ok, 'cannot attack yourself');
  world.armies['b'].col = 9; world.armies['b'].row = 9; // far away
  assert(!dispatch(world, { type: 'AttackArmy', armyId: 'a', targetArmyId: 'b' },
    { actorRealmId: 'p1', rng: rng() }).ok, 'out of reach refused');
});

test('combat: occupying an undefended hostile county captures it', () => {
  const p1 = createRealm({ id: 'p1', name: 'A', isHuman: true });
  const neutral = createCounty({ id: 'n', name: 'Neutral', ownerId: null }); // no castle, no garrison
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: 'n', soldiers: 40 });
  const world = createWorld({ realms: [p1], counties: [neutral], armies: [army] });

  const captured = captureOnOccupy(world, army);
  assertEqual(captured, 'n', 'the county is taken');
  assertEqual(world.counties['n'].ownerId, 'p1', 'ownership flips to the occupier');
  assert(world.counties['n'].happiness <= CONQUEST.conqueredHappiness, 'the conquered populace resents it');
  assertGreater(world.counties['n'].pacifiedSeasons, 0, 'and is held under occupation at first');
});

test('combat: a garrisoned castle is NOT captured by mere occupation', () => {
  const p1 = createRealm({ id: 'p1', name: 'A', isHuman: true });
  const p2 = createRealm({ id: 'p2', name: 'B' });
  const held = createCounty({ id: 'h', name: 'Held', ownerId: 'p2', castle: CastleType.MotteAndBailey, garrison: 20 });
  const army = createArmy({ id: 'a', ownerId: 'p1', col: 0, row: 0, countyId: 'h', soldiers: 40 });
  const world = createWorld({ realms: [p1, p2], counties: [held], armies: [army] });

  assertEqual(captureOnOccupy(world, army), null, 'no capture');
  assertEqual(world.counties['h'].ownerId, 'p2', 'still the defender’s — needs a siege');
});
