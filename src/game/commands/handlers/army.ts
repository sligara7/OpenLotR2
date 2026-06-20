/* Army commands: move an army across the map. */

import { buildBritainTileMap, findTilePath } from '../../maps/index.ts';
import { ok, err } from '../types.ts';
import { captureOnOccupy } from './combat.ts';
import type { MoveArmy, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';

export function moveArmy(state: GameState, cmd: MoveArmy, ctx: CommandContext): CommandResult {
  const army = state.armies[cmd.armyId];
  if (!army) return err(`Unknown army: ${cmd.armyId}`);
  if (army.ownerId !== ctx.actorRealmId) return err('That army is not yours');

  // Reachability is validated against the map (mountains/water block; rivers
  // cost extra). FUTURE: movement points limit how far per turn; here a
  // reachable destination is reached in full.
  const map = buildBritainTileMap();
  const path = findTilePath(map, { col: army.col, row: army.row }, { col: cmd.col, row: cmd.row });
  if (!path) return err('No passable route to that tile');

  const dest = path.tiles[path.tiles.length - 1];
  army.col = cmd.col;
  army.row = cmd.row;
  army.countyId = dest.countyId; // forage from the county now occupied

  // Occupying a hostile, undefended county town takes it; a garrisoned castle
  // shrugs off the march and must be besieged instead.
  const captured = captureOnOccupy(state, army);
  return ok(undefined, captured ? { captured } : undefined);
}
