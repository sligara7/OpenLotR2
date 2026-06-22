/* Diplomacy — opinion, gifts/compliments/insults, alliances, betrayal, decay. */

import { test, assert, assertEqual, assertGreater, assertLess } from '../testing/harness.ts';
import { createRealm } from '../state/realm.ts';
import { createCounty } from '../state/county.ts';
import { createWorld } from '../state/world.ts';
import { createArmy } from '../state/army.ts';
import { createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import {
  opinionOf,
  areAllied,
  areEnemies,
  formAlliance,
  registerHostility,
  runDiplomacy,
  opinionBand,
  requestsTo,
} from '../systems/diplomacy.ts';
import { captureOnOccupy } from '../commands/handlers/combat.ts';
import { buildBritainTileMap, countyTowns, findTilePath } from '../maps/index.ts';
import { planMilitary } from '../ai/military.ts';
import { OpinionBand } from '../types/diplomacy.ts';
import { DIPLOMACY } from '../constants.ts';
import { createRng } from '../rng.ts';
import { planDiplomacy } from '../ai/diplomacy.ts';
import { TRAITS_BY_PERSONALITY } from '../ai/traits.ts';
import { NoblePersonality } from '../types/enums.ts';

const ctx = { actorRealmId: 'p1' };

/** A tiny three-realm world with treasuries, no map dependence. */
function trio() {
  const realms = [
    createRealm({ id: 'p1', name: 'You', isHuman: true, gold: 1000 }),
    createRealm({ id: 'p2', name: 'Rival', gold: 100 }),
    createRealm({ id: 'p3', name: 'Bystander', gold: 100 }),
  ];
  const counties = [
    createCounty({ id: 'a', name: 'A', ownerId: 'p1' }),
    createCounty({ id: 'b', name: 'B', ownerId: 'p2' }),
    createCounty({ id: 'c', name: 'C', ownerId: 'p3' }),
  ];
  return createWorld({ realms, counties });
}

test('gift: transfers gold and raises the recipient\'s regard for the giver', () => {
  const w = trio();
  const res = dispatch(w, { type: 'SendGift', toRealmId: 'p2', gold: 200 }, ctx);
  assert(res.ok, 'gift accepted');
  assertEqual(w.realms.p1.treasury.gold, 800, 'giver paid');
  assertEqual(w.realms.p2.treasury.gold, 300, 'recipient enriched');
  // Directional: p2 now likes p1 more; p1's view of p2 is untouched.
  assertGreater(opinionOf(w, 'p2', 'p1'), 0, 'recipient warms to the giver');
  assertEqual(opinionOf(w, 'p1', 'p2'), 0, 'the giver\'s own view is unchanged');
});

test('gift: a single gift is capped, and you cannot gift gold you lack', () => {
  const w = trio();
  dispatch(w, { type: 'SendGift', toRealmId: 'p2', gold: 1000 }, ctx);
  assert(opinionOf(w, 'p2', 'p1') <= DIPLOMACY.giftOpinionCap, 'gift goodwill is capped');
  const broke = dispatch(w, { type: 'SendGift', toRealmId: 'p2', gold: 5000 }, ctx);
  assert(!broke.ok, 'cannot gift gold you do not have');
});

test('compliment: free goodwill with diminishing returns; insult bites', () => {
  const w = trio();
  dispatch(w, { type: 'SendCompliment', toRealmId: 'p2' }, ctx);
  const first = opinionOf(w, 'p2', 'p1');
  assertGreater(first, 0, 'a compliment earns goodwill');
  // Crank opinion near the ceiling: further compliments buy almost nothing.
  w.diplomacy.opinions.p2.p1 = 95;
  dispatch(w, { type: 'SendCompliment', toRealmId: 'p2' }, ctx);
  assertLess(opinionOf(w, 'p2', 'p1') - 95, first, 'kind words buy less when already adored');

  dispatch(w, { type: 'SendInsult', toRealmId: 'p3' }, ctx);
  assertLess(opinionOf(w, 'p3', 'p1'), 0, 'an insult sours the relationship');
});

test('alliance: an accepted offer binds both sides; a rejected one does not', () => {
  const w = trio();
  const offer = dispatch(w, { type: 'OfferAlliance', toRealmId: 'p2' }, ctx);
  assert(offer.ok, 'offer made');
  const id = (offer.data as { proposalId: string }).proposalId;
  assertEqual(w.diplomacy.proposals.length, 1, 'one pending offer');

  // p2 accepts (acting as p2).
  const acc = dispatch(w, { type: 'RespondToAlliance', proposalId: id, accept: true }, { actorRealmId: 'p2' });
  assert(acc.ok, 'accepted');
  assert(areAllied(w, 'p1', 'p2'), 'now allied');
  assertEqual(w.diplomacy.proposals.length, 0, 'offer consumed');
  assertGreater(opinionOf(w, 'p1', 'p2'), 0, 'forming the pact warms both sides');

  // A rejected offer leaves no alliance.
  const o2 = dispatch(w, { type: 'OfferAlliance', toRealmId: 'p3' }, ctx);
  const id2 = (o2.data as { proposalId: string }).proposalId;
  dispatch(w, { type: 'RespondToAlliance', proposalId: id2, accept: false }, { actorRealmId: 'p3' });
  assert(!areAllied(w, 'p1', 'p3'), 'rejection forms no pact');
});

test('alliance: only the addressee may answer, and breaking it costs regard', () => {
  const w = trio();
  const offer = dispatch(w, { type: 'OfferAlliance', toRealmId: 'p2' }, ctx);
  const id = (offer.data as { proposalId: string }).proposalId;
  // p3 cannot answer an offer made to p2.
  assert(!dispatch(w, { type: 'RespondToAlliance', proposalId: id, accept: true }, { actorRealmId: 'p3' }).ok,
    'a third party cannot answer');
  dispatch(w, { type: 'RespondToAlliance', proposalId: id, accept: true }, { actorRealmId: 'p2' });

  const warm = opinionOf(w, 'p2', 'p1');
  const broke = dispatch(w, { type: 'BreakAlliance', withRealmId: 'p2' }, ctx);
  assert(broke.ok, 'alliance broken');
  assert(!areAllied(w, 'p1', 'p2'), 'no longer allied');
  assertLess(opinionOf(w, 'p2', 'p1'), warm, 'the jilted party thinks less of you');
  assert(!dispatch(w, { type: 'BreakAlliance', withRealmId: 'p2' }, ctx).ok, 'nothing left to break');
});

test('hostility: attacking sours relations and, repeated, breeds a permanent enemy', () => {
  const w = trio();
  registerHostility(w, 'p1', 'p2');
  assertLess(opinionOf(w, 'p2', 'p1'), 0, 'the victim resents the aggressor');
  // Hammer the relationship below the enemy threshold.
  for (let i = 0; i < 5; i += 1) registerHostility(w, 'p1', 'p2');
  assert(areEnemies(w, 'p1', 'p2'), 'enough aggression makes a sworn enemy');
  // Enemies can never ally, even by force.
  formAlliance(w, 'p1', 'p2');
  assert(!areAllied(w, 'p1', 'p2'), 'a sworn enemy will not ally');
});

test('doublecross: striking an ally shatters the pact and stains your name everywhere', () => {
  const w = trio();
  formAlliance(w, 'p1', 'p2');
  assert(areAllied(w, 'p1', 'p2'), 'allied first');
  const bystanderBefore = opinionOf(w, 'p3', 'p1');

  const result = registerHostility(w, 'p1', 'p2');
  assert(result.doublecross, 'flagged as a betrayal');
  assert(!areAllied(w, 'p1', 'p2'), 'the alliance is shattered');
  assert(areEnemies(w, 'p1', 'p2'), 'the betrayed becomes a permanent enemy');
  assertLess(opinionOf(w, 'p3', 'p1'), bystanderBefore, 'even bystanders trust you less');
});

test('doublecross via the battle command marks the betrayer (data.hostility)', () => {
  const realms = [
    createRealm({ id: 'p1', name: 'You', isHuman: true }),
    createRealm({ id: 'p2', name: 'Ally', gold: 0 }),
  ];
  const counties = [createCounty({ id: 'a', name: 'A', ownerId: 'p2' })];
  const armies = [
    createArmy({ id: 'mine', ownerId: 'p1', col: 1, row: 1, countyId: null, units: { Swordsman: 100 } }),
    createArmy({ id: 'theirs', ownerId: 'p2', col: 1, row: 1, countyId: 'a', units: { Peasant: 30 } }),
  ];
  const w = createWorld({ realms, counties, armies });
  formAlliance(w, 'p1', 'p2');
  const res = dispatch(w, { type: 'AttackArmy', armyId: 'mine', targetArmyId: 'theirs' },
    { actorRealmId: 'p1', rng: createRng(7) });
  assert(res.ok, 'attack resolved');
  assert((res.data as { hostility: { doublecross: boolean } }).hostility.doublecross, 'attacking an ally is a doublecross');
  assert(areEnemies(w, 'p1', 'p2'), 'now sworn enemies');
});

test('decay: opinions drift toward neutral, allies warm, stale offers expire', () => {
  const w = trio();
  w.diplomacy.opinions.p2 = { p1: 10 };
  w.diplomacy.opinions.p3 = { p1: -10 };
  formAlliance(w, 'p1', 'p3'); // p3<->p1 warms instead of decaying
  const alliedBefore = opinionOf(w, 'p3', 'p1');
  // A proposal old enough to lapse.
  w.diplomacy.proposals.push({ id: 'old', fromRealmId: 'p1', toRealmId: 'p2', kind: 'alliance', turn: 0 });
  w.turn = DIPLOMACY.proposalTtl;

  const ledger = runDiplomacy(w);
  assertEqual(opinionOf(w, 'p2', 'p1'), 10 - DIPLOMACY.opinionDecayPerTurn, 'a positive opinion cools toward 0');
  assertGreater(opinionOf(w, 'p3', 'p1'), alliedBefore, 'allies grow fonder');
  assert(ledger.expiredProposals.includes('old'), 'the stale offer lapsed');
});

test('opinionBand: maps the score onto the manual\'s red/blue/green', () => {
  assertEqual(opinionBand(50), OpinionBand.Friendly, 'high = green');
  assertEqual(opinionBand(0), OpinionBand.Indifferent, 'mid = blue');
  assertEqual(opinionBand(-50), OpinionBand.Hostile, 'low = red');
});

test('AI: a diplomatic ruler accepts an alliance from a realm it likes', () => {
  const w = createBritainWorld(); // p1 human, p2 Baron, p3 Knight
  // p3 offers the Baron (p2) an alliance, and the Baron already trusts p3.
  w.diplomacy.opinions.p2 = { p3: 60 };
  const offer = dispatch(w, { type: 'OfferAlliance', toRealmId: 'p2' }, { actorRealmId: 'p3' });
  const id = (offer.data as { proposalId: string }).proposalId;

  const plan = planDiplomacy(w, w.realms.p2, TRAITS_BY_PERSONALITY[NoblePersonality.Baron]);
  const reply = plan.find((c) => c.type === 'RespondToAlliance');
  assert(!!reply && reply.type === 'RespondToAlliance' && reply.proposalId === id && reply.accept,
    'the Baron accepts an offer from a realm it likes');

  // And applying the plan actually seals the pact.
  for (const c of plan) dispatch(w, c, { actorRealmId: 'p2' });
  assert(areAllied(w, 'p2', 'p3'), 'alliance sealed through the AI plan');
});

test('compliment: flattering the same realm too often backfires', () => {
  const w = trio();
  const r1 = dispatch(w, { type: 'SendCompliment', toRealmId: 'p2' }, ctx);
  assert((r1.data as { backfired: boolean }).backfired === false, 'first compliment is sincere');
  const afterFirst = opinionOf(w, 'p2', 'p1');
  const r2 = dispatch(w, { type: 'SendCompliment', toRealmId: 'p2' }, ctx);
  assert((r2.data as { backfired: boolean }).backfired === true, 'an immediate repeat reads as manipulation');
  assertLess(opinionOf(w, 'p2', 'p1'), afterFirst, 'the empty flattery sours them');
});

test('ally request: only an ally may be asked, and only to defend your own county', () => {
  const w = trio();
  // Not allied yet → refused.
  assert(!dispatch(w, { type: 'RequestAllyDefend', allyRealmId: 'p2', countyId: 'a' }, ctx).ok, 'must be allied');
  formAlliance(w, 'p1', 'p2');
  // Defend must name one of MY counties.
  assert(!dispatch(w, { type: 'RequestAllyDefend', allyRealmId: 'p2', countyId: 'c' }, ctx).ok, 'can only defend your own');
  assert(dispatch(w, { type: 'RequestAllyDefend', allyRealmId: 'p2', countyId: 'a' }, ctx).ok, 'defend my county');
  // Attack a third party's county.
  assert(dispatch(w, { type: 'RequestAllyAttack', allyRealmId: 'p2', targetCountyId: 'c' }, ctx).ok, 'attack a rival');
  assertEqual(requestsTo(w, 'p2').length, 2, 'both requests stand for the ally');
});

test('ally-capture guard: marching into an ally\'s county does not seize it', () => {
  const realms = [
    createRealm({ id: 'p1', name: 'You', isHuman: true }),
    createRealm({ id: 'p2', name: 'Ally' }),
  ];
  const counties = [createCounty({ id: 'b', name: 'B', ownerId: 'p2' })];
  const army = createArmy({ id: 'mine', ownerId: 'p1', col: 0, row: 0, countyId: 'b', units: { Swordsman: 80 } });
  const w = createWorld({ realms, counties, armies: [army] });
  formAlliance(w, 'p1', 'p2');
  const captured = captureOnOccupy(w, w.armies.mine);
  assertEqual(captured, null, 'an ally\'s land is not captured');
  assertEqual(w.counties.b.ownerId, 'p2', 'still the ally\'s');
});

test('AI honours an ally\'s attack request, marching on the named county', () => {
  const w = createBritainWorld(); // p2 = Baron with an army at its capital
  formAlliance(w, 'p2', 'p3');
  const army = Object.values(w.armies).find((a) => a.ownerId === 'p2');
  assert(!!army, 'the Baron has an army');

  // Find an enemy county the Baron can actually march to.
  const map = buildBritainTileMap();
  const towns = countyTowns(map);
  let target: string | null = null;
  for (const c of Object.values(w.counties)) {
    if (c.ownerId === 'p2') continue;
    const dest = towns.get(c.id);
    if (dest && findTilePath(map, { col: army!.col, row: army!.row }, dest)) { target = c.id; break; }
  }
  assert(!!target, 'a reachable enemy county exists');

  dispatch(w, { type: 'RequestAllyAttack', allyRealmId: 'p2', targetCountyId: target! }, { actorRealmId: 'p3' });
  const plan = planMilitary(w, w.realms.p2, TRAITS_BY_PERSONALITY[NoblePersonality.Baron]);
  const dest = towns.get(target!)!;
  const march = plan.find((c) => c.type === 'MoveArmy' && c.col === dest.col && c.row === dest.row);
  assert(!!march, 'the Baron marches on the county its ally named');
});

test('AI: the war-loving Knight refuses an alliance even from a realm it likes', () => {
  const w = createBritainWorld();
  w.diplomacy.opinions.p3 = { p2: 80 };
  const offer = dispatch(w, { type: 'OfferAlliance', toRealmId: 'p3' }, { actorRealmId: 'p2' });
  const id = (offer.data as { proposalId: string }).proposalId;
  const plan = planDiplomacy(w, w.realms.p3, TRAITS_BY_PERSONALITY[NoblePersonality.Knight]);
  const reply = plan.find((c) => c.type === 'RespondToAlliance');
  assert(!!reply && reply.type === 'RespondToAlliance' && reply.proposalId === id && !reply.accept,
    'the Knight is "no statesman" and declines');
});
