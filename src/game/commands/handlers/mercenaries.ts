/*
 * Mercenaries (Manual Part-4): hire a self-armed band of professionals for gold.
 * Unlike conscription they cost no population and no happiness — they aren't your
 * people — but the up-front fee is steep and their wages (systems/wages.ts) are
 * far higher. Each hire raises a NEW band at the county town; two mercenary
 * armies refuse to serve together (handled in CombineArmy).
 */

import { buildBritainTileMap, countyTowns } from '../../maps/index.ts';
import { MERCENARY_HIRE_COST_PER_SOLDIER, MIN_ARMY_SIZE } from '../../constants.ts';
import { UNIT_TYPES } from '../../types/enums.ts';
import { createArmy, freeArmyId } from '../../state/army.ts';
import { ok, err } from '../types.ts';
import type { HireMercenaries, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { findOwnedCounty } from './util.ts';

export function hireMercenaries(state: GameState, cmd: HireMercenaries, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  const realm = state.realms[ctx.actorRealmId];
  if (!realm) return err(`Unknown realm: ${ctx.actorRealmId}`);
  if (!UNIT_TYPES.includes(cmd.unit)) return err(`Unknown unit type: ${cmd.unit}`);

  const count = Math.floor(cmd.count);
  if (!Number.isFinite(count) || count < MIN_ARMY_SIZE) {
    return err(`A mercenary band needs at least ${MIN_ARMY_SIZE} soldiers`);
  }

  const cost = count * MERCENARY_HIRE_COST_PER_SOLDIER;
  if (realm.treasury.gold < cost) return err(`Not enough gold to hire (need ${cost})`);

  const town = countyTowns(buildBritainTileMap()).get(cmd.countyId);
  if (!town) return err('No town for the mercenaries to muster at');

  realm.treasury.gold -= cost; // self-armed: no weapons drawn, no population taken
  const id = freeArmyId(state.armies, ctx.actorRealmId);
  state.armies[id] = createArmy({
    id, ownerId: ctx.actorRealmId, col: town.col, row: town.row,
    countyId: cmd.countyId, units: { [cmd.unit]: count }, mercenary: true,
  });
  return ok(undefined, { armyId: id, cost });
}
