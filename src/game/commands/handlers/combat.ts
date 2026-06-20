/*
 * Combat commands: attack an enemy army (field battle) and lay a siege.
 *
 * Both are validated-and-applied here against the authoritative state. Capturing
 * an *undefended* county happens implicitly when an army occupies it (see
 * captureOnOccupy, called from the MoveArmy handler); a garrisoned castle can
 * only be taken by LaySiege, which the engine then advances each season.
 */

import { hexNeighbours } from '../../maps/index.ts';
import { resolveBattle } from '../../systems/combat.ts';
import { setUnits } from '../../state/army.ts';
import { captureCounty, updateEliminations } from '../../systems/conquest.ts';
import { ok, err } from '../types.ts';
import type { AttackArmy, LaySiege, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import type { Army } from '../../types/army.ts';
import { findOwnedArmy } from './util.ts';

/** Are two armies close enough to fight (same tile or adjacent)? */
function inReach(a: Army, b: Army): boolean {
  if (a.col === b.col && a.row === b.row) return true;
  return hexNeighbours(a.col, a.row).some(([c, r]) => c === b.col && r === b.row);
}

export function attackArmy(state: GameState, cmd: AttackArmy, ctx: CommandContext): CommandResult {
  if (!ctx.rng) return err('AttackArmy requires an RNG in the command context');
  const { army, error } = findOwnedArmy(state, cmd.armyId, ctx.actorRealmId);
  if (error || !army) return err(error!);

  const target = state.armies[cmd.targetArmyId];
  if (!target) return err(`Unknown army: ${cmd.targetArmyId}`);
  if (target.ownerId === ctx.actorRealmId) return err('That army is yours');
  if (!inReach(army, target)) return err('Target army is out of reach');

  const result = resolveBattle({ units: army.units }, { units: target.units }, ctx.rng);
  setUnits(army, result.attacker.unitsAfter);
  setUnits(target, result.defender.unitsAfter);
  if (result.attackerDestroyed) delete state.armies[army.id];
  if (result.defenderDestroyed) delete state.armies[target.id];
  updateEliminations(state);

  return ok(undefined, { battle: result });
}

export function laySiege(state: GameState, cmd: LaySiege, ctx: CommandContext): CommandResult {
  const { army, error } = findOwnedArmy(state, cmd.armyId, ctx.actorRealmId);
  if (error || !army) return err(error!);

  const county = state.counties[cmd.countyId];
  if (!county) return err(`Unknown county: ${cmd.countyId}`);
  if (army.countyId !== cmd.countyId) return err('Army must occupy the county to besiege it');
  if (county.ownerId === ctx.actorRealmId) return err('Cannot besiege your own county');
  if (county.castle.garrison <= 0) {
    return err('No garrison to besiege — occupy the town to capture it');
  }

  // Begin a new siege, or refresh an existing one (e.g. after re-issuing it).
  const existing = state.sieges[cmd.countyId];
  state.sieges[cmd.countyId] = {
    countyId: cmd.countyId,
    attackerRealmId: ctx.actorRealmId,
    besiegerArmyId: army.id,
    progress: existing?.progress ?? 0,
    seasons: existing?.seasons ?? 0,
  };
  return ok();
}

/**
 * Capture the county an army has just moved into, if it is hostile and
 * undefended (no garrison, no enemy field army present). Called from MoveArmy.
 * Returns the captured county id, or null if nothing was taken.
 */
export function captureOnOccupy(state: GameState, army: Army): string | null {
  const county = army.countyId ? state.counties[army.countyId] : undefined;
  if (!county || county.ownerId === army.ownerId) return null;
  if (county.castle.garrison > 0) return null; // garrisoned → needs a siege

  // A defending field army (the current owner's) shields the county.
  const defended = Object.values(state.armies).some(
    (a) => a.id !== army.id && a.countyId === county.id && a.ownerId === county.ownerId,
  );
  if (defended) return null;

  captureCounty(state, county.id, army.ownerId);
  updateEliminations(state);
  return county.id;
}
