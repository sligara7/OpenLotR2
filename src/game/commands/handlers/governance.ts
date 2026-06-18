/* Governance commands: tax rate, rations, labour policy. */

import { RATION_MULTIPLIER } from '../../types/enums.ts';
import { ok, err } from '../types.ts';
import type { SetTaxRate, SetRation, SetLabourPolicy, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { clamp01, findOwnedCounty } from './util.ts';

export function setTaxRate(state: GameState, cmd: SetTaxRate, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  if (!Number.isFinite(cmd.rate) || cmd.rate < 0 || cmd.rate > 100) {
    return err('Tax rate must be between 0 and 100');
  }
  // Manual: at zero happiness you cannot raise the tax rate at all.
  if (county.happiness <= 0 && cmd.rate > county.taxRate) {
    return err('Cannot raise taxes while happiness is zero');
  }
  county.taxRate = cmd.rate;
  return ok();
}

export function setRation(state: GameState, cmd: SetRation, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  if (!(cmd.level in RATION_MULTIPLIER)) return err(`Invalid ration level: ${cmd.level}`);
  county.wantedRation = cmd.level;
  return ok();
}

export function setLabourPolicy(
  state: GameState,
  cmd: SetLabourPolicy,
  ctx: CommandContext,
): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  if (cmd.industryShare !== undefined) county.labour.industryShare = clamp01(cmd.industryShare);
  if (cmd.grainBeefBalance !== undefined) county.labour.grainBeefBalance = clamp01(cmd.grainBeefBalance);
  return ok();
}
