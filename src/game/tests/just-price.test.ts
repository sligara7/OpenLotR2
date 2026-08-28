/* The just price, and wool — medieval economics on top of the market. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createDemoWorld, createBritainWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { createRng } from '../rng.ts';
import { quote } from '../systems/merchants.ts';
import { opinionOf } from '../systems/diplomacy.ts';
import { updateHappiness } from '../systems/happiness.ts';
import { TradeGood } from '../types/trade.ts';
import type { GameState } from '../types/realm.ts';

const ctx = { actorRealmId: 'p1' };

function marketHere(): { world: GameState; countyId: string } {
  const world = createDemoWorld();
  const mine = Object.values(world.counties).filter((c) => c.ownerId === 'p1');
  world.merchants = [{ id: 'm', name: 'Aldwin', circuit: [mine[0].id], at: 0, purse: 99999, wares: 99999 }];
  return { world, countyId: mine[0].id };
}

test('just price: selling bread out of a hungry county is remembered', () => {
  const { world, countyId } = marketHere();
  const county = world.counties[countyId];
  // Starve the county: stores far below what its people need.
  county.food.grainSacks = 40;
  const before = quote(world, countyId, TradeGood.Grain, 'p1')!;
  assert(before.factor > 1.25, `grain is scarce here (factor ${before.factor.toFixed(2)})`);

  const res = dispatch(world, { type: 'Trade', countyId, good: TradeGood.Grain, side: 'sell', quantity: 35 }, ctx);
  assert(res.ok, 'the sale goes through — the market does not forbid it');
  assert(county.grievance > 0, `but the county resents it (grievance ${county.grievance.toFixed(1)})`);

  // And the resentment reaches the Happiness Report as an event.
  const happyBefore = county.happiness;
  const d = updateHappiness(county);
  assert(d.events < 0, 'it shows up as an event against the lord');
  assert(county.happiness < happyBefore || happyBefore === 0, 'and costs real happiness');
});

test('just price: a big enough scandal is heard by every other noble', () => {
  const { world, countyId } = marketHere();
  const county = world.counties[countyId];
  county.food.grainSacks = 40;
  const opinionBefore = opinionOf(world, 'p2', 'p1');

  dispatch(world, { type: 'Trade', countyId, good: TradeGood.Grain, side: 'sell', quantity: 35 }, ctx);
  assert(opinionOf(world, 'p2', 'p1') < opinionBefore, 'rivals think less of a famine profiteer');
});

test('just price: an ordinary sale in a well-fed county is nobody’s business', () => {
  const { world, countyId } = marketHere();
  const county = world.counties[countyId];
  county.food.grainSacks = county.population * 20; // barns overflowing
  const opinionBefore = opinionOf(world, 'p2', 'p1');

  dispatch(world, { type: 'Trade', countyId, good: TradeGood.Grain, side: 'sell', quantity: 200 }, ctx);
  assertEqual(county.grievance, 0, 'selling surplus is just trade');
  assertEqual(opinionOf(world, 'p2', 'p1'), opinionBefore, 'and nobody minds');
});

test('just price: feeding a hungry county earns what conquest cannot', () => {
  const { world, countyId } = marketHere();
  const county = world.counties[countyId];
  county.food.grainSacks = 40;
  county.grievance = 20;
  world.realms.p1.treasury.gold = 100000;
  const opinionBefore = opinionOf(world, 'p2', 'p1');

  const res = dispatch(world, { type: 'Trade', countyId, good: TradeGood.Grain, side: 'buy', quantity: 400 }, ctx);
  assert(res.ok, 'bread can be bought in');
  assert(county.grievance < 20, 'which answers the grievance');
  assert(opinionOf(world, 'p2', 'p1') > opinionBefore, 'and good lordship is noticed');
});

test('just price: only staples are a moral matter', () => {
  const { world, countyId } = marketHere();
  const county = world.counties[countyId];
  world.realms.p1.treasury.iron = 5;
  const q = quote(world, countyId, TradeGood.Iron, 'p1')!;
  assert(q.factor > 1.25, 'iron is scarce for this realm');

  dispatch(world, { type: 'Trade', countyId, good: TradeGood.Iron, side: 'sell', quantity: 5 }, ctx);
  assertEqual(county.grievance, 0, 'selling scarce iron is commerce, not sin');
});

test('wool: upland counties grow it, and it is the dearest thing they grow', () => {
  const world = createBritainWorld();
  const rng = createRng(3);
  const mine = Object.values(world.counties).filter((c) => c.ownerId === 'p1');
  assert(mine.some((c) => c.industries.Woolgrowing.present), 'pasture counties keep sheep');

  for (let i = 0; i < 8; i++) dispatch(world, { type: 'EndTurn' }, { actorRealmId: 'p1', rng });
  assert(world.realms.p1.treasury.wool > 0, 'and the shearing pools to the realm');

  // Wool is worth more per unit than anything else a county can grow.
  const wool = quote(world, mine[0].id, TradeGood.Wool, 'p1')!;
  const grain = quote(world, mine[0].id, TradeGood.Grain, 'p1')!;
  assert(wool.buy > grain.buy, 'a fleece costs more than a sack');
});

test('wool: selling it costs the county nothing, unlike selling its bread', () => {
  const { world, countyId } = marketHere();
  const county = world.counties[countyId];
  county.food.grainSacks = 40; // hungry
  world.realms.p1.treasury.wool = 200;

  dispatch(world, { type: 'Trade', countyId, good: TradeGood.Wool, side: 'sell', quantity: 100 }, ctx);
  assertEqual(county.grievance, 0, 'nobody starves for want of a fleece');
  assertEqual(county.food.grainSacks, 40, 'and the granary is untouched');
});
