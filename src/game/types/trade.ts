/*
 * Trade — what a merchant deals in, and where merchants are.
 *
 * The manual's marketplace (Part-3, "Merchants") sells twelve things: cows, ale,
 * grain, stone, wood, iron, and the six weapons. Ale is the odd one out here —
 * it is a temporary happiness effect on a county rather than a stock anybody
 * holds, so it keeps its own BuyAle command and is not a TradeGood.
 *
 * Everything else maps onto state the game already keeps, and WHERE it is kept
 * is the thing to know: grain and cattle sit in the county's own stores, while
 * timber, stone, iron and finished weapons pool into the realm's shared
 * treasury. So selling grain empties one county's barns, but selling iron draws
 * on the whole realm.
 */

import { UnitType } from './enums.ts';

/** Anything a merchant will buy or sell. */
export const TradeGood = {
  Grain: 'Grain',
  Cows: 'Cows',
  Wood: 'Wood',
  Stone: 'Stone',
  Iron: 'Iron',
  Wool: 'Wool',
  // Weapons, named for the unit that carries them so they index the armory
  // directly. The manual lists pikes, maces, swords, bows, crossbows and
  // knights' mail; peasants carry nothing, so there is no peasant good.
  Pikeman: UnitType.Pikeman,
  Maceman: UnitType.Maceman,
  Swordsman: UnitType.Swordsman,
  Archer: UnitType.Archer,
  Crossbowman: UnitType.Crossbowman,
  Knight: UnitType.Knight,
} as const;
export type TradeGood = (typeof TradeGood)[keyof typeof TradeGood];

/** Every good in a stable order — display, iteration, serialisation. */
export const TRADE_GOODS: readonly TradeGood[] = [
  TradeGood.Grain, TradeGood.Cows, TradeGood.Wool, TradeGood.Wood, TradeGood.Stone, TradeGood.Iron,
  TradeGood.Pikeman, TradeGood.Maceman, TradeGood.Swordsman,
  TradeGood.Archer, TradeGood.Crossbowman, TradeGood.Knight,
];

/** The goods that are weapons, and so live in the realm armory. */
export const WEAPON_GOODS: readonly TradeGood[] = [
  TradeGood.Pikeman, TradeGood.Maceman, TradeGood.Swordsman,
  TradeGood.Archer, TradeGood.Crossbowman, TradeGood.Knight,
];

export function isWeaponGood(good: TradeGood): boolean {
  return WEAPON_GOODS.includes(good);
}

/**
 * A merchant wagon working a circuit of county towns.
 *
 * Merchants are the reason trade is a decision rather than a button: the manual
 * says they "travel from county to county on a set course", and that a central
 * county may host one almost every season while a remote one waits. So a circuit
 * is an ordered ring of county ids, and the wagon steps one county along it each
 * season. Where your counties sit decides how often you get to trade at all.
 *
 * Movement is a plain index step — no randomness — so the same game always
 * produces the same merchant routes, which the determinism rule requires.
 */
export interface Merchant {
  id: string;
  /** Display name, so a wagon on the map is somebody rather than a token. */
  name: string;
  /** Ordered ring of county ids this wagon works. */
  circuit: string[];
  /** Index into `circuit` — where the wagon is right now. */
  at: number;
  /**
   * Crowns this wagon can still pay out for goods you sell it, this visit.
   *
   * A merchant is one cart with one strongbox, not a bottomless buyer. Without
   * this a granary is a money printer: a county sitting on four years of grain
   * could be emptied into gold in a single afternoon. Refilled when the wagon
   * moves on, so each visit is a fresh chance to do business.
   */
  purse: number;
  /** Crowns' worth of goods still on the cart for you to buy, this visit. */
  wares: number;
}

/** Which county a merchant currently stands in. */
export function merchantCounty(merchant: Merchant): string {
  return merchant.circuit[merchant.at % merchant.circuit.length];
}
