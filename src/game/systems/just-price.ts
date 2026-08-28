/*
 * The just price — what it costs a lord to profit from his people's hunger.
 *
 * Supply-and-demand pricing makes food dear exactly where it is scarce, which
 * means the most profitable act available to a ruler is to sell his own hungry
 * county's grain to a passing merchant. Mechanically that is correct. In 1268
 * it is also the thing that got men put in the pillory: the assizes of bread
 * and ale fixed staple prices, and forestalling a dearth was an offence.
 *
 * So the market keeps its economics and gains a conscience. Stripping a short
 * county's stores is remembered by the people who went hungry, and by every
 * other noble watching. Carrying food INTO a short county is the opposite —
 * good lordship, and the thing a lord was supposed to do.
 *
 * Only STAPLES count. Selling iron out of a realm that is short of iron is a
 * commercial decision; selling bread out of a county that is short of bread is
 * a moral one, and the period drew that line sharply.
 */

import {
  JUST_PRICE_THRESHOLD,
  PROFITEERING_GRIEVANCE,
  PROFITEERING_REPUTATION_HIT,
  RELIEF_GOODWILL,
} from '../constants.ts';
import { adjustOpinion } from './diplomacy.ts';
import { TradeGood } from '../types/trade.ts';
import type { County } from '../types/county.ts';
import type { GameState } from '../types/realm.ts';

/** The goods the period treated as a moral matter rather than a commercial one. */
const STAPLES: readonly TradeGood[] = [TradeGood.Grain, TradeGood.Cows];

export interface JustPriceOutcome {
  /** Resentment added to the county (0 when the trade was unremarkable). */
  grievance: number;
  /** True when other nobles heard about it. */
  scandal: boolean;
  /** True when the lord fed a hungry county instead of stripping it. */
  relief: boolean;
}

const NOTHING: JustPriceOutcome = { grievance: 0, scandal: false, relief: false };

/**
 * Judge a completed staple trade and apply what it costs or earns.
 *
 * `factor` is the supply multiplier the trade was priced at — above
 * JUST_PRICE_THRESHOLD the good was scarce here. `reference` is what the county
 * would comfortably hold, which is what makes the penalty proportionate: forty
 * sacks out of a small shire is a scandal, forty out of a great one is a rounding
 * error.
 */
export function judgeTrade(
  state: GameState,
  county: County,
  realmId: string,
  good: TradeGood,
  side: 'buy' | 'sell',
  quantity: number,
  factor: number,
  reference: number,
  stockAfter: number,
): JustPriceOutcome {
  /** What the county held before this trade moved the stores. */
  const stockBefore = (s: 'buy' | 'sell', q: number): number =>
    s === 'sell' ? stockAfter + q : Math.max(1, stockAfter - q);

  if (!STAPLES.includes(good)) return NOTHING;
  if (factor <= JUST_PRICE_THRESHOLD) return NOTHING;

  // How badly this county needed the food, and how much was taken.
  //
  // "How much" is the LARGER of two shares, because either can be the outrage:
  // selling a big slice of what the county needs for the year, or selling most
  // of the little it had left. Taking 35 sacks from a shire that needs 1,280 is
  // a rounding error against its needs — but if 40 sacks were all it had, it is
  // the granary door being carried off, and only the second measure sees that.
  const scarcity = factor - JUST_PRICE_THRESHOLD;
  const held = stockBefore(side, quantity);
  const share = Math.max(quantity / Math.max(1, reference), quantity / Math.max(1, held));

  if (side === 'sell') {
    const grievance = scarcity * share * PROFITEERING_GRIEVANCE * 10;
    if (grievance < 0.5) return NOTHING; // too small to notice
    county.grievance += grievance;

    // A scandal only where it is sizeable — a lord is not pilloried for a cartload.
    const scandal = grievance >= PROFITEERING_GRIEVANCE / 2;
    if (scandal) {
      for (const other of Object.values(state.realms)) {
        if (other.id === realmId || other.eliminated) continue;
        adjustOpinion(state, other.id, realmId, -PROFITEERING_REPUTATION_HIT);
      }
    }
    return { grievance, scandal, relief: false };
  }

  // Buying food into a county that is short of it: relief, and it is noticed.
  const relief = scarcity * share >= 0.02;
  if (!relief) return NOTHING;
  county.grievance = Math.max(0, county.grievance - PROFITEERING_GRIEVANCE);
  for (const other of Object.values(state.realms)) {
    if (other.id === realmId || other.eliminated) continue;
    adjustOpinion(state, other.id, realmId, RELIEF_GOODWILL);
  }
  return { grievance: 0, scandal: false, relief: true };
}
