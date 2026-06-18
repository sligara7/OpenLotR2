/* Logistics commands: transport food between counties, buy ale. */

import { ALE_COST, ALE_DURATION } from '../../constants.ts';
import { ok, err } from '../types.ts';
import type { SendSupplies, BuyAle, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { findOwnedCounty } from './util.ts';

export function sendSupplies(state: GameState, cmd: SendSupplies, ctx: CommandContext): CommandResult {
  if (cmd.fromCountyId === cmd.toCountyId) return err('Origin and destination are the same');
  const from = findOwnedCounty(state, cmd.fromCountyId, ctx.actorRealmId);
  if (from.error || !from.county) return err(from.error!);
  const to = findOwnedCounty(state, cmd.toCountyId, ctx.actorRealmId);
  if (to.error || !to.county) return err(to.error!);

  const grain = cmd.grainSacks ?? 0;
  const cows = cmd.cows ?? 0;
  if (grain < 0 || cows < 0) return err('Cannot send negative quantities');
  if (grain > from.county.food.grainSacks) return err('Not enough grain to send');
  if (cows > from.county.food.cows) return err('Not enough cattle to send');

  // FUTURE: model multi-season travel + interception by enemy armies (Manual
  // Part-3 "Transporting Goods"). For now the transfer is immediate.
  from.county.food.grainSacks -= grain;
  from.county.food.cows -= cows;
  to.county.food.grainSacks += grain;
  to.county.food.cows += cows;
  return ok();
}

export function buyAle(state: GameState, cmd: BuyAle, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  const realm = state.realms[ctx.actorRealmId];
  if (!realm) return err(`Unknown realm: ${ctx.actorRealmId}`);
  if (realm.treasury.gold < ALE_COST) return err('Not enough gold to buy ale');

  // FUTURE: require a merchant to be present in the county.
  realm.treasury.gold -= ALE_COST;
  county.aleSeasons = ALE_DURATION;
  return ok();
}
