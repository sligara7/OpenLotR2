/* Custom game setup (Manual Part-8): nobles, gold, army, castle, status, difficulty. */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { createBritainWorld } from '../scenarios.ts';
import { CastleType } from '../types/enums.ts';
import { countiesOfRealm } from '../state/world.ts';
import { planRealmTurn } from '../ai/planner.ts';

const ownedArmies = (state: ReturnType<typeof createBritainWorld>, realmId: string) =>
  Object.values(state.armies).filter((a) => a.ownerId === realmId);

test('defaults: three nobles, the classic start', () => {
  const w = createBritainWorld();
  assertEqual(Object.keys(w.realms).length, 3, 'human + two AI');
  assertEqual(w.realms.p1.treasury.gold, 200, 'default starting gold');
  assertEqual(w.options.difficulty, 'normal', 'normal difficulty by default');
  assert(!!w.realms.p1 && w.realms.p1.isHuman, 'p1 is the human');
});

test('nobles: fewer or more rivals join the map', () => {
  const duel = createBritainWorld({ nobles: 2 });
  assertEqual(Object.keys(duel.realms).length, 2, 'just a duel');
  assert(!duel.realms.p3, 'no third noble');

  const full = createBritainWorld({ nobles: 5 });
  assertEqual(Object.keys(full.realms).length, 5, 'five nobles');
  assertGreater(countiesOfRealm(full, 'p4').length, 0, 'the fourth noble holds land');
  assertGreater(countiesOfRealm(full, 'p5').length, 0, 'the fifth noble holds land');
  // Clamped: asking for too many gives the max roster.
  assertEqual(Object.keys(createBritainWorld({ nobles: 9 }).realms).length, 5, 'clamped to the roster');
});

test('starting gold + difficulty: AI coffers scale, the human gets exactly what was set', () => {
  const easy = createBritainWorld({ startingGold: 300, difficulty: 'easy' });
  const hard = createBritainWorld({ startingGold: 300, difficulty: 'hard' });
  assertEqual(easy.realms.p1.treasury.gold, 300, 'the human always gets the set amount');
  assertEqual(hard.realms.p1.treasury.gold, 300, 'regardless of difficulty');
  assertGreater(hard.realms.p2.treasury.gold, easy.realms.p2.treasury.gold, 'a harder AI starts richer');
});

test('army size: zero means no standing army; difficulty scales the AI host', () => {
  const none = createBritainWorld({ armySize: 0 });
  assertEqual(Object.keys(none.armies).length, 0, 'nobody starts with an army');

  const hard = createBritainWorld({ armySize: 60, difficulty: 'hard' });
  const easy = createBritainWorld({ armySize: 60, difficulty: 'easy' });
  assertEqual(ownedArmies(hard, 'p1')[0].soldiers, 60, 'the human army is exactly as set');
  assertGreater(ownedArmies(hard, 'p2')[0].soldiers, ownedArmies(easy, 'p2')[0].soldiers, 'a harder AI fields more');
});

test('starting castle: None leaves an open town; a grander castle garrisons more', () => {
  const open = createBritainWorld({ startingCastle: CastleType.None });
  assertEqual(open.counties.hampshire.castle.garrison, 0, 'no garrison');
  assertEqual(open.counties.hampshire.castle.type, CastleType.None, 'no castle');

  const motte = createBritainWorld(); // default Motte & Bailey
  const stone = createBritainWorld({ startingCastle: CastleType.StoneCastle });
  assertGreater(stone.counties.hampshire.castle.garrison, motte.counties.hampshire.castle.garrison,
    'a stone castle holds a larger garrison');
});

test('AI tuning: defaults are recorded, and the dials reshape behaviour', () => {
  const def = createBritainWorld();
  assertEqual(def.options.ai.aggression, 1, 'aggression default');
  assertEqual(def.options.ai.diplomacy, 1, 'diplomacy default');
  assertEqual(def.options.ai.boldness, 0.3, 'boldness default');

  // Aggression ×0 stands every army down — even the war-loving Baron issues no
  // attack/march/siege commands (his aggression 0.7 → 0, below the 0.3 march gate).
  const pacifist = createBritainWorld({ aiAggression: 0 });
  const baron = pacifist.realms.p2;
  const plan = planRealmTurn(pacifist, baron);
  const warlike = plan.filter((c) => c.type === 'MoveArmy' || c.type === 'AttackArmy' || c.type === 'LaySiege' || c.type === 'FerryArmy');
  assertEqual(warlike.length, 0, 'a pacifist-tuned world makes no war');

  // Diplomacy ×0 silences alliance overtures.
  const noDiplo = createBritainWorld({ aiDiplomacy: 0 });
  noDiplo.diplomacy.opinions.p2 = { p3: 80 };
  const dplan = planRealmTurn(noDiplo, noDiplo.realms.p2);
  assertEqual(dplan.filter((c) => c.type === 'OfferAlliance').length, 0, 'no diplomacy, no overtures');
});

test('county status: a strong start is more populous than a weak one', () => {
  const weak = createBritainWorld({ countyStatus: 'weak' });
  const strong = createBritainWorld({ countyStatus: 'strong' });
  assertGreater(strong.counties.hampshire.population, weak.counties.hampshire.population, 'strong > weak');
  // Neutral (unowned) counties are unaffected by the player's county status.
  assertEqual(weak.counties.yorkshire.population, strong.counties.yorkshire.population, 'neutral land is the same');
});
