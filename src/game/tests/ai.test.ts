/* AI rulers — economic governance + army maneuver, via the command protocol. */

import { test, assert, assertEqual, assertGreater } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { createBritainWorld } from '../scenarios.ts';
import { CastleType, NoblePersonality } from '../types/enums.ts';
import { planGovernance } from '../ai/governance.ts';
import { planMilitary, planReinforce } from '../ai/military.ts';
import { takeAiTurns, planRealmTurn } from '../ai/planner.ts';
import { createArmy } from '../state/army.ts';
import { TRAITS_BY_PERSONALITY } from '../ai/traits.ts';
import { createRng } from '../rng.ts';
import type { Command } from '../commands/types.ts';

const BARON = TRAITS_BY_PERSONALITY[NoblePersonality.Baron];

/** A one-county AI realm with tunable mood/economy. */
function realmWith(opts: { happiness: number; taxRate: number; grainSacks?: number; cows?: number }) {
  const realm = createRealm({
    id: 'p2', name: 'Baron', personality: NoblePersonality.Baron,
    gold: 200, wood: 100, stone: 100,
  });
  const county = createCounty({
    id: 'home', name: 'Home', ownerId: 'p2',
    population: 200, happiness: opts.happiness, taxRate: opts.taxRate,
    grainSacks: opts.grainSacks ?? 100, cows: opts.cows ?? 5,
    fieldCount: 4, castle: CastleType.MotteAndBailey,
  });
  return { realm, state: createWorld({ realms: [realm], counties: [county] }) };
}

const has = (cmds: Command[], type: Command['type']) => cmds.some((c) => c.type === type);
const find = <T extends Command['type']>(cmds: Command[], type: T) =>
  cmds.find((c) => c.type === type) as Extract<Command, { type: T }> | undefined;

test('ai: an unhappy county gets tax relief, half rations and ale', () => {
  const { realm, state } = realmWith({ happiness: 20, taxRate: 50 });
  const cmds = planGovernance(state, realm, BARON);

  const tax = find(cmds, 'SetTaxRate');
  assert(!!tax && tax.rate < 50, 'taxes cut below the painful 50');
  const ration = find(cmds, 'SetRation');
  assert(!!ration && ration.level === 'Half', 'scarce food → half rations');
  assert(has(cmds, 'BuyAle'), 'buys ale to quell the unrest');
});

test('ai: a content county is taxed up toward the personality target', () => {
  const { realm, state } = realmWith({ happiness: 70, taxRate: 10, grainSacks: 2000 });
  const tax = find(planGovernance(state, realm, BARON), 'SetTaxRate');
  assertEqual(tax?.rate, BARON.targetTax, 'raises tax to the Baron target');
});

test('ai: idle fields are put to grain', () => {
  const { realm, state } = realmWith({ happiness: 60, taxRate: 25, grainSacks: 2000 });
  const fieldCmds = planGovernance(state, realm, BARON).filter((c) => c.type === 'AssignField');
  assertEqual(fieldCmds.length, 4, 'all four fallow fields assigned');
  assert(fieldCmds.every((c) => c.type === 'AssignField' && c.use === 'Grain'), 'to grain');
});

test('ai: every ruler takes the field, however timid', () => {
  // Aggression used to be a switch: below 0.3 a ruler issued NO military
  // commands at all, so the Bishop never moved an army, never defended and was
  // eliminated in every measured game. He was not losing, he was not playing.
  const world = createBritainWorld();
  const baron = world.realms.p2;

  const eager = planMilitary(world, baron, TRAITS_BY_PERSONALITY[NoblePersonality.Baron]);
  assert(has(eager, 'MoveArmy'), 'an aggressive ruler marches on its border');

  const timid = planMilitary(world, baron, TRAITS_BY_PERSONALITY[NoblePersonality.Bishop]);
  assertGreater(timid.length, 0, 'and a timid one still takes the field');
});

test('ai: timidity shows up as caution, not absence', () => {
  // The Bishop wants a far bigger edge before he will commit to a fight than
  // the Knight does. Same world, same army, different appetite for risk.
  const world = createBritainWorld();
  const realm = world.realms.p2;
  const mine = world.armies['p2-army'];
  const foe = createArmy({
    id: 'foe', ownerId: 'p3', col: mine.col, row: mine.row,
    countyId: mine.countyId, soldiers: Math.round(mine.soldiers / 1.3),
  });
  world.armies.foe = foe;

  const bold = planMilitary(world, realm, TRAITS_BY_PERSONALITY[NoblePersonality.Knight]);
  const timid = planMilitary(world, realm, TRAITS_BY_PERSONALITY[NoblePersonality.Bishop]);

  assert(has(bold, 'AttackArmy'), 'a 1.3x edge is enough for the Knight');
  assert(!has(timid, 'AttackArmy'), 'but not nearly enough for the Bishop');
});

test('ai: the pacifist dial still stands every army down', () => {
  // The per-game ai.aggression multiplier promises "a peaceful world" at zero.
  // The floor that keeps that promise sits far below every personality, so it
  // silences the dial and never a ruler's own temperament.
  const world = createBritainWorld();
  const pacified = { ...TRAITS_BY_PERSONALITY[NoblePersonality.Knight], aggression: 0 };

  assertEqual(planMilitary(world, world.realms.p2, pacified).length, 0, 'no war at all');
});

test('ai: takeAiTurns drives only AI realms and obeys ownership', () => {
  const world = createBritainWorld();
  const humanTaxBefore = world.counties.hampshire.taxRate; // p1 (human)
  const scotTaxBefore = world.counties.midlothian.taxRate; // p2 (AI)
  const armyBefore = `${world.armies['p2-army'].col},${world.armies['p2-army'].row}`;

  const log = takeAiTurns(world, createRng(1));

  assertEqual(log.realms.length, 2, 'two AI realms acted (p2, p3), not the human');
  assert(log.realms.every((r) => r.realmId !== 'p1'), 'human realm left alone');
  assert(log.realms.every((r) => r.rejected.length === 0), 'no command was rejected');
  assertEqual(world.counties.hampshire.taxRate, humanTaxBefore, 'human county untouched');
  assertGreater(Math.abs(world.counties.midlothian.taxRate - scotTaxBefore), 0, 'AI adjusted its own tax');
  const armyAfter = `${world.armies['p2-army'].col},${world.armies['p2-army'].row}`;
  assert(armyAfter !== armyBefore, 'AI army marched');
});

test('ai: the army target scales with the realm (a big realm raises a big host)', () => {
  const realm = createRealm({ id: 'p2', name: 'Big', personality: NoblePersonality.Baron });
  const counties = Array.from({ length: 10 }, (_, i) =>
    createCounty({ id: `c${i}`, name: `C${i}`, ownerId: 'p2', population: 400, happiness: 90 }));
  const army = createArmy({ id: 'p2-army', ownerId: 'p2', col: 0, row: 0, countyId: 'c0', soldiers: 40 });
  const world = createWorld({ realms: [realm], counties, armies: [army] });

  const draft = planReinforce(world, realm, BARON).find((c) => c.type === 'Conscript' && c.armyId === 'p2-army');
  assert(draft?.type === 'Conscript', 'reinforces the standing army');
  if (draft?.type === 'Conscript') assertGreater(draft.count, 50, 'drafts toward a host far larger than the old 50-man cap');
});

test('ai: a realm that has lost its army musters a fresh one', () => {
  const realm = createRealm({ id: 'p2', name: 'Reborn', personality: NoblePersonality.Baron });
  const county = createCounty({ id: 'home', name: 'Home', ownerId: 'p2', population: 400, happiness: 90 });
  const world = createWorld({ realms: [realm], counties: [county] }); // no armies at all

  const muster = planReinforce(world, realm, BARON).find((c) => c.type === 'Conscript');
  assert(muster?.type === 'Conscript' && muster.armyId === undefined, 'raises a brand-new army');
  if (muster?.type === 'Conscript') assertGreater(muster.count, 49, 'a legal army of at least 50');
});

test('ai: planRealmTurn is read-only (planning does not mutate state)', () => {
  const world = createBritainWorld();
  const before = world.counties.midlothian.taxRate;
  planRealmTurn(world, world.realms.p2);
  assertEqual(world.counties.midlothian.taxRate, before, 'planning leaves state untouched');
});
