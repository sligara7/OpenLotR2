/*
 * Trade — buying and selling at a visiting merchant.
 *
 * Validate-and-apply in one step, like every other handler: a trade that cannot
 * be afforded, or that the county cannot supply, leaves the world untouched and
 * comes back as a domain error rather than half-settling.
 */

import { err, ok } from '../types.ts';
import type { CommandContext, CommandResult, Trade } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { adjustStock, merchantAt, quote, stockOf } from '../../systems/merchants.ts';
import { TRADE_GOODS } from '../../types/trade.ts';
import { judgeTrade } from '../../systems/just-price.ts';
import { findOwnedCounty } from './util.ts';

export function trade(state: GameState, cmd: Trade, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);

  const realm = state.realms[ctx.actorRealmId];
  if (!realm) return err(`Unknown realm: ${ctx.actorRealmId}`);

  if (!TRADE_GOODS.includes(cmd.good)) return err(`Not a tradeable good: ${cmd.good}`);
  if (!Number.isInteger(cmd.quantity) || cmd.quantity <= 0) {
    return err('Trade quantity must be a positive whole number');
  }

  // The manual's rule: "Trade may be conducted only when a merchant is present
  // in a county." Where your counties sit is therefore part of the economy.
  const merchant = merchantAt(state, cmd.countyId);
  if (!merchant) return err(`No merchant is visiting ${county.name}`);

  // Priced HERE, against what this county and realm actually hold.
  const price = quote(state, cmd.countyId, cmd.good, ctx.actorRealmId);
  if (!price) return err('Cannot price that trade');

  if (cmd.side === 'buy') {
    const cost = price.buy * cmd.quantity;
    if (realm.treasury.gold < cost) {
      return err(`Not enough gold: ${cmd.quantity} ${cmd.good} costs ${cost}`);
    }
    // One cart carries only so much.
    if (merchant.wares < cost) {
      const afford = Math.floor(merchant.wares / price.buy);
      return err(`${merchant.name} has only ${afford} ${cmd.good} left to sell`);
    }
    realm.treasury.gold -= cost;
    merchant.wares -= cost;
    adjustStock(cmd.good, county, realm.treasury, cmd.quantity);
    const judged = judgeTrade(state, county, ctx.actorRealmId, cmd.good, 'buy',
      cmd.quantity, price.factor, price.reference,
      stockOf(cmd.good, county, realm.treasury));
    return ok(undefined, {
      merchant: merchant.name, unitPrice: price.buy, total: cost, factor: price.factor,
      relief: judged.relief,
    });
  }

  const held = stockOf(cmd.good, county, realm.treasury);
  if (held < cmd.quantity) {
    return err(`Only ${held} ${cmd.good} to sell`);
  }
  const gain = price.sell * cmd.quantity;
  // A merchant has one strongbox. This is what stops a full granary being
  // emptied into gold in a single visit.
  if (merchant.purse < gain) {
    const affordable = Math.floor(merchant.purse / price.sell);
    return err(`${merchant.name} can only afford ${affordable} more ${cmd.good} this visit`);
  }
  adjustStock(cmd.good, county, realm.treasury, -cmd.quantity);
  realm.treasury.gold += gain;
  merchant.purse -= gain;
  // Selling a staple out of a county that needs it is the medieval sin.
  const judged = judgeTrade(state, county, ctx.actorRealmId, cmd.good, 'sell',
    cmd.quantity, price.factor, price.reference,
    stockOf(cmd.good, county, realm.treasury));
  return ok(undefined, {
    merchant: merchant.name, unitPrice: price.sell, total: gain, factor: price.factor,
    grievance: judged.grievance, scandal: judged.scandal,
  });
}
