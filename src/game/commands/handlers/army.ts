/* Army commands: move an army across the map. */

import { buildBritainTileMap, findTilePath, advanceWithinBudget } from '../../maps/index.ts';
import { ok, err } from '../types.ts';
import { captureOnOccupy } from './combat.ts';
import type { MoveArmy, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';

export function moveArmy(state: GameState, cmd: MoveArmy, ctx: CommandContext): CommandResult {
  const army = state.armies[cmd.armyId];
  if (!army) return err(`Unknown army: ${cmd.armyId}`);
  if (army.ownerId !== ctx.actorRealmId) return err('That army is not yours');

  // Reachability is validated against the map (mountains/water block; rivers
  // cost extra). The army then marches as far along the route as its remaining
  // movement points allow, halting partway if the destination is too far.
  const map = buildBritainTileMap();
  const path = findTilePath(map, { col: army.col, row: army.row }, { col: cmd.col, row: cmd.row });
  if (!path) return err('No passable route to that tile');
  if (path.tiles.length < 2) return err('Army is already there');

  const { index, spent } = advanceWithinBudget(path, army.movement);
  if (index === 0) return err('Not enough movement points to advance this turn');

  const dest = path.tiles[index];
  army.col = dest.col;
  army.row = dest.row;
  army.countyId = dest.countyId; // forage from the county now occupied
  army.movement -= spent;

  // Occupying a hostile, undefended county town takes it; a garrisoned castle
  // shrugs off the march and must be besieged instead.
  const captured = captureOnOccupy(state, army);
  const reached = index === path.tiles.length - 1;
  return ok(undefined, captured ? { captured, reached } : { reached });
}
