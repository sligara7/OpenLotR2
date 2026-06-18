/* Castle command: choose/alter the county's castle design. */

import { CastleType, Industry } from '../../types/enums.ts';
import { ok, err } from '../types.ts';
import type { BuildCastle, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { findOwnedCounty } from './util.ts';

export function buildCastle(state: GameState, cmd: BuildCastle, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  if (cmd.design === CastleType.None) return err('Choose a castle design');
  if (county.castle.type === cmd.design && county.castle.buildProgress >= 1) {
    return err('That castle already stands here');
  }

  // Start (or switch to) the project. Materials are drawn over time by
  // production.ts as wood/stone accrue; the build "industry" is now active.
  // FUTURE: refund freed materials on a downgrade; auto-garrison on completion.
  county.castle.type = cmd.design;
  county.castle.buildProgress = 0;
  county.castle.damage = 0;
  county.industries[Industry.Castle].operational = true;
  return ok();
}
