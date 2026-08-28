/* Merchants and the marketplace (Manual Part-3 "Merchants"). */

import { test, assert, assertEqual } from '../testing/harness.ts';
import { createDemoWorld } from '../scenarios.ts';
import { dispatch } from '../commands/dispatch.ts';
import { createRng } from '../rng.ts';
import { advanceMerchants, basePrice, merchantAt, quote, stockOf, supplyFactor } from '../systems/merchants.ts';
import { TradeGood, TRADE_GOODS, merchantCounty } from '../types/trade.ts';
import type { GameState } from '../types/realm.ts';

const ctx = { actorRealmId: 'p1' };

/** A world where a merchant is standing in one of the player's counties. */
function worldWithMerchantHere(): { world: GameState; countyId: string } {
  const world = createDemoWorld();
  const mine = Object.values(world.counties).filter((c) => c.ownerId === 'p1');
  // Exactly ONE wagon, parked on a county the player owns. The demo world has
  // only three counties, so the default spread puts a merchant in every one of
  // them — which would quietly make the "no merchant here" case untestable.
  world.merchants = [{ id: 'm-test', name: 'Aldwin', circuit: [mine[0].id], at: 0, purse: 100000, wares: 100000 }];
  return { world, countyId: mine[0].id };
}

test('market: a merchant always buys low and sells high', () => {
  for (const good of TRADE_GOODS) {
    const { buy, sell } = basePrice(good);
    assert(buy > sell, `${good}: buying (${buy}) costs more than selling returns (${sell})`);
    assert(sell >= 1, `${good}: selling is always worth something`);
  }
  // The relative worth of goods survives the margin: a knight's mail is the
  // dearest thing on the cart, grain the cheapest.
  assert(basePrice(TradeGood.Knight).buy > basePrice(TradeGood.Grain).buy * 10, 'mail dwarfs grain');
});

test('market: buying spends gold and delivers the goods', () => {
  const { world, countyId } = worldWithMerchantHere();
  const realm = world.realms.p1;
  realm.treasury.gold = 1000;
  const woodBefore = realm.treasury.wood;

  const res = dispatch(world, { type: 'Trade', countyId, good: TradeGood.Wood, side: 'buy', quantity: 10 }, ctx);
  assert(res.ok, 'the trade was accepted');
  assertEqual(realm.treasury.wood, woodBefore + 10, 'ten timber arrived in the treasury');
  const woodPrice = quote(world, countyId, TradeGood.Wood, 'p1')!;
  assert(realm.treasury.gold < 1000, 'and were paid for');
  assert(woodPrice.buy >= 1, 'timber has a local price');
});

test('market: selling empties the store it came from and fills the purse', () => {
  const { world, countyId } = worldWithMerchantHere();
  const realm = world.realms.p1;
  const county = world.counties[countyId];
  realm.treasury.gold = 0;
  county.food.grainSacks = 100;

  const res = dispatch(world, { type: 'Trade', countyId, good: TradeGood.Grain, side: 'sell', quantity: 40 }, ctx);
  assert(res.ok, 'the sale was accepted');
  // Grain is the COUNTY's, not the realm's — selling it empties this county's barns.
  assertEqual(county.food.grainSacks, 60, 'the grain left this county');
  assert(realm.treasury.gold > 0, 'and the gold arrived');
});

test('market: weapons trade against the shared armory, grain against one county', () => {
  const { world, countyId } = worldWithMerchantHere();
  const realm = world.realms.p1;
  const county = world.counties[countyId];
  realm.treasury.gold = 5000;

  dispatch(world, { type: 'Trade', countyId, good: TradeGood.Swordsman, side: 'buy', quantity: 3 }, ctx);
  assertEqual(realm.treasury.weapons.Swordsman ?? 0, 3, 'swords went to the realm armory');
  assertEqual(stockOf(TradeGood.Swordsman, county, realm.treasury), 3, 'and are counted as stock');
});

test('market: refused with no merchant, no gold, or nothing to sell', () => {
  const { world, countyId } = worldWithMerchantHere();
  const realm = world.realms.p1;

  realm.treasury.gold = 1;
  assert(!dispatch(world, { type: 'Trade', countyId, good: TradeGood.Knight, side: 'buy', quantity: 5 }, ctx).ok,
    'cannot buy what you cannot afford');

  realm.treasury.iron = 0;
  assert(!dispatch(world, { type: 'Trade', countyId, good: TradeGood.Iron, side: 'sell', quantity: 1 }, ctx).ok,
    'cannot sell what you do not have');

  assert(!dispatch(world, { type: 'Trade', countyId, good: TradeGood.Grain, side: 'buy', quantity: 0 }, ctx).ok,
    'a trade must be for a real quantity');

  // A county the wagon has left cannot trade at all — this is what makes a
  // merchant's visit worth waiting for.
  const elsewhere = Object.values(world.counties).find((c) => c.ownerId === 'p1' && c.id !== countyId);
  if (elsewhere) {
    realm.treasury.gold = 1000;
    assert(!dispatch(world, { type: 'Trade', countyId: elsewhere.id, good: TradeGood.Wood, side: 'buy', quantity: 1 }, ctx).ok,
      'no merchant, no market');
  }
});

test('market: you cannot trade in a county you do not own', () => {
  const { world } = worldWithMerchantHere();
  const theirs = Object.values(world.counties).find((c) => c.ownerId !== 'p1');
  if (!theirs) return;
  world.merchants[0].circuit = [theirs.id];
  world.merchants[0].at = 0;
  world.realms.p1.treasury.gold = 1000;
  assert(!dispatch(world, { type: 'Trade', countyId: theirs.id, good: TradeGood.Wood, side: 'buy', quantity: 1 }, ctx).ok,
    'the market is only open in your own counties');
});

test('market: wagons move on each season, and the same game routes them the same way', () => {
  const world = createDemoWorld();
  assert(world.merchants.length > 0, 'the map has merchants on it');

  const before = world.merchants.map(merchantCounty);
  advanceMerchants(world);
  const after = world.merchants.map(merchantCounty);
  assert(before.some((c, i) => c !== after[i]), 'at least one wagon moved on');

  // Determinism: a second world built the same way lays out identical routes.
  const twin = createDemoWorld();
  assertEqual(
    JSON.stringify(twin.merchants.map((m) => m.circuit)),
    JSON.stringify(createDemoWorld().merchants.map((m) => m.circuit)),
    'merchant circuits are reproducible',
  );
});

test('market: ending a turn moves the merchants', () => {
  const world = createDemoWorld();
  const rng = createRng(7);
  const before = world.merchants.map(merchantCounty).join(',');
  dispatch(world, { type: 'EndTurn' }, { actorRealmId: 'p1', rng });
  assert(world.merchants.map(merchantCounty).join(',') !== before, 'the season carried the wagons along');
  // And a merchant is always somewhere findable.
  const where = merchantCounty(world.merchants[0]);
  assert(merchantAt(world, where)?.id === world.merchants[0].id, 'and can be found by county');
});

test('market: a glut is worth less and a shortage is worth more', () => {
  const { world, countyId } = worldWithMerchantHere();
  const county = world.counties[countyId];

  // A county sitting on four years of grain cannot expect a good price.
  county.food.grainSacks = county.population * 16;
  const glut = quote(world, countyId, TradeGood.Grain, 'p1')!;

  // The same county stripped bare will pay dearly for bread.
  county.food.grainSacks = 0;
  const famine = quote(world, countyId, TradeGood.Grain, 'p1')!;

  assert(glut.factor < 1, `a glut depresses the price (factor ${glut.factor.toFixed(2)})`);
  assert(famine.factor > 1, `a shortage lifts it (factor ${famine.factor.toFixed(2)})`);
  assert(famine.buy > glut.buy, 'so bread costs more where it is scarce');
  assert(famine.sell > glut.sell, 'and fetches more where it is scarce');
});

test('market: the supply multiplier is bounded at both ends', () => {
  // No amount of hoarding makes a good free, and no famine makes it priceless.
  assert(supplyFactor(1e9, 100) >= 0.2 - 1e-9, 'a vast glut still bottoms out');
  assert(supplyFactor(0, 100) <= 3 + 1e-9, 'an empty store still tops out');
  assertEqual(Math.round(supplyFactor(100, 100) * 100), 100, 'at the reference the price is the base price');
});

test('market: a merchant cannot buy a whole granary in one visit', () => {
  const world = createDemoWorld();
  const mine = Object.values(world.counties).filter((c) => c.ownerId === 'p1');
  const countyId = mine[0].id;
  // A realistic wagon this time — its own purse, not a bottomless one.
  world.merchants = [{ id: 'm', name: 'Aldwin', circuit: [countyId], at: 0, purse: 250, wares: 400 }];
  const county = world.counties[countyId];
  const realm = world.realms.p1;

  county.food.grainSacks = 50_000;
  realm.treasury.gold = 0;

  const res = dispatch(world, { type: 'Trade', countyId, good: TradeGood.Grain, side: 'sell', quantity: 50_000 }, ctx);
  assert(!res.ok, 'one cart cannot carry off fifty thousand sacks');
  assert(/afford/.test(res.error ?? ''), `and says so: ${res.error}`);

  // What the purse WILL cover goes through, and empties it.
  const price = quote(world, countyId, TradeGood.Grain, 'p1')!;
  const affordable = Math.floor(250 / price.sell);
  assert(dispatch(world, { type: 'Trade', countyId, good: TradeGood.Grain, side: 'sell', quantity: affordable }, ctx).ok,
    'but a cartload does');
  assert(realm.treasury.gold <= 250, `and never pays out more than the purse held (${realm.treasury.gold})`);
});

test('market: the purse refills when the wagon moves on', () => {
  const world = createDemoWorld();
  for (const m of world.merchants) { m.purse = 0; m.wares = 0; }
  advanceMerchants(world);
  assert(world.merchants.every((m) => m.purse > 0 && m.wares > 0), 'a new county is a fresh chance to trade');
});
