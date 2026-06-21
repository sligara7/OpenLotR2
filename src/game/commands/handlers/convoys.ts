/*
 * SendConvoy — dispatch food from one of your counties to one of your armies.
 * Grain leaves the county's store immediately and rides out as a convoy from the
 * county town; systems/convoys.ts then carries it (and risks interception) over
 * the turns until it reaches the army.
 */

import { buildBritainTileMap, countyTowns } from '../../maps/index.ts';
import { GRAIN_SACKS_PER_PORTION } from '../../constants.ts';
import { ok, err } from '../types.ts';
import type { SendConvoy, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { findOwnedCounty, findOwnedArmy } from './util.ts';

/** An unused convoy id for a realm. */
function freeConvoyId(state: GameState, realmId: string): string {
  let id = `${realmId}-convoy`;
  let n = 1;
  while (state.convoys[id]) { n += 1; id = `${realmId}-convoy-${n}`; }
  return id;
}

export function sendConvoy(state: GameState, cmd: SendConvoy, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.fromCountyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  const { army, error: armyError } = findOwnedArmy(state, cmd.toArmyId, ctx.actorRealmId);
  if (armyError || !army) return err(armyError!);

  const grain = cmd.grainSacks;
  if (!Number.isFinite(grain) || grain <= 0) return err('Send a positive amount of grain');
  if (grain > county.food.grainSacks) return err('Not enough grain to send');

  const town = countyTowns(buildBritainTileMap()).get(cmd.fromCountyId);
  if (!town) return err('No town to dispatch the convoy from');

  county.food.grainSacks -= grain;
  const id = freeConvoyId(state, ctx.actorRealmId);
  state.convoys[id] = {
    id,
    ownerId: ctx.actorRealmId,
    col: town.col,
    row: town.row,
    food: grain / GRAIN_SACKS_PER_PORTION,
    targetArmyId: army.id,
  };
  return ok(undefined, { convoyId: id });
}
