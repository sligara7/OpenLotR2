/*
 * Merchants and the marketplace.
 *
 * Three jobs: build the circuits merchants walk, roll them one county along each
 * season, and price and settle a trade.
 *
 * The design point is that trade is LOCAL AND OCCASIONAL. A merchant is only
 * ever in one county, so you can only trade where a wagon has stopped and only
 * in a county you hold — which is what makes where your counties sit matter, and
 * what stops the marketplace being a permanently open shop window.
 *
 * Deterministic throughout: circuits come from the map in a fixed order and a
 * wagon advances by an index step, so no seed is consulted and the same game
 * always produces the same routes.
 */

import {
  GOOD_VALUE,
  MERCHANT_BUY_MARKUP,
  MERCHANT_PURSE,
  MERCHANT_SELL_MARGIN,
  MERCHANT_WARES,
  PRICE_ELASTICITY,
  PRICE_FACTOR_MAX,
  PRICE_FACTOR_MIN,
  REFERENCE_FOOD_SEASONS,
  REFERENCE_PER_COUNTY,
  SEASONS_BETWEEN_VISITS,
} from '../constants.ts';
import { RATION_MULTIPLIER } from '../types/enums.ts';
import { TradeGood, isWeaponGood, merchantCounty, type Merchant } from '../types/trade.ts';
import type { County } from '../types/county.ts';
import type { Adjacency, GameState, Treasury } from '../types/realm.ts';

/** A good's worth before anyone has looked at where it is. */
export function basePrice(good: TradeGood): { buy: number; sell: number } {
  const value = GOOD_VALUE[good];
  return {
    buy: Math.max(1, Math.round(value * MERCHANT_BUY_MARKUP)),
    sell: Math.max(1, Math.round(value * MERCHANT_SELL_MARGIN)),
  };
}

/**
 * What a county or realm would comfortably hold of a good — the level at which
 * supply and demand are in balance and the price is the base price.
 *
 * Food is reckoned against what the people actually eat, so a big county needs
 * a big granary before it counts as well stocked. Materials and weapons are
 * reckoned per county held, so a wide realm is expected to keep wider stores
 * and is not treated as glutted simply for being large.
 */
export function referenceStock(good: TradeGood, county: County, countiesHeld: number): number {
  const held = Math.max(1, countiesHeld);
  switch (good) {
    case TradeGood.Grain: {
      const perSeason = county.population * RATION_MULTIPLIER[county.wantedRation];
      return Math.max(1, perSeason * REFERENCE_FOOD_SEASONS);
    }
    case TradeGood.Cows:
      // A herd worth about a season of beef for the county it grazes in.
      return Math.max(1, county.population / 4);
    default:
      return Math.max(1, (REFERENCE_PER_COUNTY[good] ?? 20) * held);
  }
}

/**
 * How supply bends the price.
 *
 * Above the reference holding the good is a glut and worth less; below it, the
 * good is scarce and worth more. Bounded at both ends so nothing ever becomes
 * free or priceless.
 */
export function supplyFactor(stock: number, reference: number): number {
  const ratio = Math.max(stock, 0) / Math.max(reference, 1);
  if (ratio <= 0) return PRICE_FACTOR_MAX;
  const factor = Math.pow(ratio, -PRICE_ELASTICITY);
  return Math.min(PRICE_FACTOR_MAX, Math.max(PRICE_FACTOR_MIN, factor));
}

export interface Quote {
  buy: number;
  sell: number;
  /** What is actually held here, and what would be a comfortable holding. */
  stock: number;
  reference: number;
  /** The supply multiplier: below 1 a glut, above 1 a shortage. */
  factor: number;
}

/**
 * The price of a good HERE, to this realm, right now.
 *
 * This is the whole point of the marketplace being local. The same sack of
 * grain is worth a fortune in a county that has just been stripped and almost
 * nothing in one whose barns are overflowing — so trade becomes a question of
 * where and when, not just what.
 */
export function quote(state: GameState, countyId: string, good: TradeGood, realmId: string): Quote | null {
  const county = state.counties[countyId];
  const realm = state.realms[realmId];
  if (!county || !realm) return null;

  const countiesHeld = Object.values(state.counties).filter((c) => c.ownerId === realmId).length;
  const stock = stockOf(good, county, realm.treasury);
  const reference = referenceStock(good, county, countiesHeld);
  const factor = supplyFactor(stock, reference);
  const base = basePrice(good);
  return {
    buy: Math.max(1, Math.round(base.buy * factor)),
    sell: Math.max(1, Math.round(base.sell * factor)),
    stock,
    reference,
    factor,
  };
}

/**
 * Lay out the merchants' circuits over the map.
 *
 * TWO PROPERTIES THIS HAS TO HAVE, and a first attempt had neither.
 *
 * EVERY COUNTY MUST BE ON SOMEBODY'S ROUND. The manual promises a remote county
 * "infrequent visits" — infrequent, not never. Circuits laid out by striding
 * through the county list left 37 of Britain's 82 counties unvisited for good,
 * and two of the player's three starting counties among them, which is not a
 * sparse market but an excluded one. So the counties are PARTITIONED: each
 * belongs to exactly one wagon's round, and every county therefore trades.
 *
 * A WAGON MUST TRAVEL LIKE A WAGON. Striding also produced routes that crossed
 * the country in a single season — Caithness to Kent and back. Each round is
 * now walked along county borders, so a merchant works a neighbourhood.
 *
 * How many wagons follows from how many counties, so a three-county demo map and
 * an eighty-two-county Britain both end up trading at a sensible rate rather
 * than one being saturated and the other starved.
 */
export function buildMerchants(countyIds: string[], adjacency: Adjacency): Merchant[] {
  if (countyIds.length === 0) return [];
  const names = [
    'Aldwin', 'Godric', 'Merek', 'Osbert', 'Wulfric', 'Hamo', 'Rand', 'Tobin',
    'Bertram', 'Cuthbert', 'Dunstan', 'Edric', 'Leofric', 'Oswin', 'Thurstan', 'Wystan',
  ];

  // One wagon per SEASONS_BETWEEN_VISITS counties, so a county sees a merchant
  // roughly that often however big the map is.
  const count = Math.max(1, Math.min(names.length, Math.round(countyIds.length / SEASONS_BETWEEN_VISITS)));
  const perRound = Math.ceil(countyIds.length / count);

  const unassigned = new Set(countyIds);
  const merchants: Merchant[] = [];

  for (let m = 0; m < count && unassigned.size > 0; m++) {
    const circuit: string[] = [];
    // Start where the map's own order says, so the layout is reproducible.
    let here = countyIds.find((id) => unassigned.has(id))!;

    while (circuit.length < perRound && unassigned.size > 0) {
      circuit.push(here);
      unassigned.delete(here);
      // Walk to a neighbouring county nobody has claimed; if the neighbourhood
      // is used up, begin again wherever is left.
      const next = (adjacency[here] ?? []).find((n) => unassigned.has(n))
        ?? countyIds.find((id) => unassigned.has(id));
      if (!next) break;
      here = next;
    }
    merchants.push({
      id: `merchant-${m + 1}`, name: names[m % names.length], circuit, at: 0,
      purse: MERCHANT_PURSE, wares: MERCHANT_WARES,
    });
  }
  return merchants;
}

/**
 * Roll every wagon one stop along its circuit, and restock it. Once a season.
 *
 * The restock is what makes a merchant's arrival an OPPORTUNITY rather than a
 * faucet: a fresh purse each visit, and no way to sell more than one cart can
 * carry away, however much is piled in the barns.
 */
export function advanceMerchants(state: GameState): void {
  for (const merchant of state.merchants ?? []) {
    merchant.at = (merchant.at + 1) % merchant.circuit.length;
    merchant.purse = MERCHANT_PURSE;
    merchant.wares = MERCHANT_WARES;
  }
}

/** The merchant standing in this county, if any. */
export function merchantAt(state: GameState, countyId: string): Merchant | null {
  for (const merchant of state.merchants ?? []) {
    if (merchantCounty(merchant) === countyId) return merchant;
  }
  return null;
}

/**
 * How many units of a good are on hand to sell from this county.
 *
 * Grain and cattle are the county's own; everything else is drawn from the
 * realm's shared treasury, so selling iron in Kent spends iron mined in Cumbria.
 */
export function stockOf(good: TradeGood, county: County, treasury: Treasury): number {
  switch (good) {
    case TradeGood.Grain: return county.food.grainSacks;
    case TradeGood.Cows: return county.food.cows;
    case TradeGood.Wood: return treasury.wood;
    case TradeGood.Stone: return treasury.stone;
    case TradeGood.Iron: return treasury.iron;
    case TradeGood.Wool: return treasury.wool;
    default: return isWeaponGood(good) ? (treasury.weapons[good] ?? 0) : 0;
  }
}

/** Move `delta` units of a good into (+) or out of (-) the right store. */
export function adjustStock(good: TradeGood, county: County, treasury: Treasury, delta: number): void {
  switch (good) {
    case TradeGood.Grain: county.food.grainSacks += delta; return;
    case TradeGood.Cows: county.food.cows += delta; return;
    case TradeGood.Wood: treasury.wood += delta; return;
    case TradeGood.Stone: treasury.stone += delta; return;
    case TradeGood.Iron: treasury.iron += delta; return;
    case TradeGood.Wool: treasury.wool += delta; return;
    default:
      if (isWeaponGood(good)) treasury.weapons[good] = (treasury.weapons[good] ?? 0) + delta;
  }
}
