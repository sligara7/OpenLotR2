/*
 * Turn command: end the turn and advance the world.
 *
 * In single-player/hotseat this advances immediately. For online multiplayer,
 * the SERVER decides when to actually tick (e.g. once every realm has sent
 * EndTurn) — that readiness arbitration lives in the server layer, not here.
 */

import { advanceSeason } from '../../engine.ts';
import { ok, err } from '../types.ts';
import type { CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';

export function endTurn(state: GameState, ctx: CommandContext): CommandResult {
  if (!ctx.rng) return err('EndTurn requires an RNG in the command context');
  const report = advanceSeason(state, ctx.rng);
  return ok(report);
}
