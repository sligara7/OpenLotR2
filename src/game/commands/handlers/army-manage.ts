/*
 * Army lifecycle commands: disband, split, combine (Manual Part-4).
 *
 * Disbanding returns soldiers to a county's population (and their weapons to the
 * armory); splitting carves a new army off an existing one on the same tile;
 * combining merges two of your armies that share a tile. Min-army-size and
 * ownership are enforced; all validation precedes any mutation.
 */

import { MIN_ARMY_SIZE, needsWeapon } from '../../constants.ts';
import { UNIT_TYPES } from '../../types/enums.ts';
import { createArmy, freeArmyId, setUnits, unitsOf, unitsTotal, unitsSpeed } from '../../state/army.ts';
import { updateEliminations } from '../../systems/conquest.ts';
import { ok, err } from '../types.ts';
import type { DisbandArmy, SplitArmy, CombineArmy, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { findOwnedArmy } from './util.ts';

export function disbandArmy(state: GameState, cmd: DisbandArmy, ctx: CommandContext): CommandResult {
  const { army, error } = findOwnedArmy(state, cmd.armyId, ctx.actorRealmId);
  if (error || !army) return err(error!);
  const county = army.countyId ? state.counties[army.countyId] : undefined;
  if (!county || county.ownerId !== ctx.actorRealmId) {
    return err('An army can only be disbanded in your own county');
  }
  const realm = state.realms[ctx.actorRealmId]!;

  // Citizen soldiers rejoin the population and their weapons return to the
  // armory; mercenaries are hired hands — they simply disperse, taking their own
  // arms with them.
  if (!army.mercenary) {
    for (const t of UNIT_TYPES) {
      const n = army.units[t];
      if (n > 0 && needsWeapon(t)) realm.treasury.weapons[t] = (realm.treasury.weapons[t] ?? 0) + n;
    }
    county.population += army.soldiers;
  }
  delete state.armies[army.id];
  updateEliminations(state);
  return ok();
}

export function splitArmy(state: GameState, cmd: SplitArmy, ctx: CommandContext): CommandResult {
  const { army, error } = findOwnedArmy(state, cmd.armyId, ctx.actorRealmId);
  if (error || !army) return err(error!);

  const take = unitsOf(cmd.units);
  for (const t of UNIT_TYPES) {
    if (take[t] < 0) return err('Cannot split a negative number of units');
    if (take[t] > army.units[t]) return err(`Not enough ${t} to split off`);
  }
  const takeTotal = unitsTotal(take);
  const keepTotal = army.soldiers - takeTotal;
  if (takeTotal < MIN_ARMY_SIZE) return err(`The new army needs at least ${MIN_ARMY_SIZE} soldiers`);
  if (keepTotal < MIN_ARMY_SIZE) return err(`The remaining army needs at least ${MIN_ARMY_SIZE} soldiers`);

  const keep = { ...army.units };
  for (const t of UNIT_TYPES) keep[t] -= take[t];
  setUnits(army, keep);

  const id = freeArmyId(state.armies, ctx.actorRealmId);
  const fresh = createArmy({ id, ownerId: ctx.actorRealmId, col: army.col, row: army.row, countyId: army.countyId, units: take, mercenary: army.mercenary });
  fresh.movement = Math.min(army.movement, fresh.movement); // can't out-march the parent this turn
  state.armies[id] = fresh;
  return ok(undefined, { armyId: id });
}

export function combineArmy(state: GameState, cmd: CombineArmy, ctx: CommandContext): CommandResult {
  if (cmd.armyId === cmd.intoArmyId) return err('Cannot combine an army with itself');
  const from = findOwnedArmy(state, cmd.armyId, ctx.actorRealmId);
  if (from.error || !from.army) return err(from.error!);
  const into = findOwnedArmy(state, cmd.intoArmyId, ctx.actorRealmId);
  if (into.error || !into.army) return err(into.error!);
  if (from.army.col !== into.army.col || from.army.row !== into.army.row) {
    return err('Armies must share a tile to combine');
  }
  if (from.army.mercenary && into.army.mercenary) {
    return err('Two mercenary bands will not serve together');
  }

  const merged = { ...into.army.units };
  for (const t of UNIT_TYPES) merged[t] += from.army.units[t];
  const movement = Math.min(into.army.movement, from.army.movement, unitsSpeed(merged));
  setUnits(into.army, merged);
  into.army.movement = movement;
  into.army.mercenary = into.army.mercenary || from.army.mercenary; // now contains mercenaries
  delete state.armies[from.army.id];
  return ok();
}
