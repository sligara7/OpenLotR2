/*
 * Raising troops (Manual Part-4): choose what the blacksmith forges, and turn
 * county population into soldiers. Conscription removes people from the labour
 * pool, sours their mood, and (for anything past a pitchfork) draws weapons from
 * the realm's shared armory. All validation happens before any mutation, so a
 * rejected command leaves the state untouched.
 */

import { buildBritainTileMap, countyTowns } from '../../maps/index.ts';
import { HAPPINESS, MIN_ARMY_SIZE, needsWeapon } from '../../constants.ts';
import { UNIT_TYPES } from '../../types/enums.ts';
import { createArmy, setUnits } from '../../state/army.ts';
import { ok, err } from '../types.ts';
import type { SetBlacksmith, Conscript, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { findOwnedCounty } from './util.ts';

export function setBlacksmith(state: GameState, cmd: SetBlacksmith, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  if (cmd.product !== null) {
    if (!UNIT_TYPES.includes(cmd.product)) return err(`Unknown unit type: ${cmd.product}`);
    if (!needsWeapon(cmd.product)) return err('Peasants need no weapons');
  }
  county.blacksmithProduct = cmd.product;
  return ok();
}

/** A free army id for `realm` (its capital army keeps the bare `${realm}-army`). */
function nextArmyId(state: GameState, realmId: string): string {
  let id = `${realmId}-army`;
  let n = 1;
  while (state.armies[id]) { n += 1; id = `${realmId}-army-${n}`; }
  return id;
}

export function conscript(state: GameState, cmd: Conscript, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);
  const realm = state.realms[ctx.actorRealmId];
  if (!realm) return err(`Unknown realm: ${ctx.actorRealmId}`);
  if (!UNIT_TYPES.includes(cmd.unit)) return err(`Unknown unit type: ${cmd.unit}`);

  const count = Math.floor(cmd.count);
  if (!Number.isFinite(count) || count <= 0) return err('Conscript a positive number');
  if (count > county.population) return err('Not enough people to conscript');

  // Morale floor: the manual forbids conscripting so many that happiness would
  // fall below zero. Charge this season's conscription penalty up front.
  const pct = ((county.recentConscription + count) / county.population) * 100;
  if (pct * HAPPINESS.conscriptionPenaltyPerPct > county.happiness) {
    return err('Conscripting that many would break morale');
  }

  // Arm non-peasants from the shared armory.
  if (needsWeapon(cmd.unit) && (realm.treasury.weapons[cmd.unit] ?? 0) < count) {
    return err(`Not enough ${cmd.unit} weapons in the armory`);
  }

  // Resolve the destination army (validate fully before mutating).
  const army = cmd.armyId ? state.armies[cmd.armyId] : undefined;
  let town: { col: number; row: number } | undefined;
  if (cmd.armyId) {
    if (!army) return err(`Unknown army: ${cmd.armyId}`);
    if (army.ownerId !== ctx.actorRealmId) return err('That army is not yours');
    if (army.countyId !== cmd.countyId) return err('That army is not in this county');
  } else {
    if (count < MIN_ARMY_SIZE) return err(`A new army needs at least ${MIN_ARMY_SIZE} soldiers`);
    town = countyTowns(buildBritainTileMap()).get(cmd.countyId);
    if (!town) return err('No town to muster a new army at');
  }

  // Commit.
  if (needsWeapon(cmd.unit)) realm.treasury.weapons[cmd.unit] -= count;
  county.population -= count;
  county.recentConscription += count;

  if (army) {
    setUnits(army, { ...army.units, [cmd.unit]: army.units[cmd.unit] + count });
    return ok(undefined, { armyId: army.id, conscripted: count });
  }
  const id = nextArmyId(state, ctx.actorRealmId);
  state.armies[id] = createArmy({
    id, ownerId: ctx.actorRealmId, col: town!.col, row: town!.row,
    countyId: cmd.countyId, units: { [cmd.unit]: count },
  });
  return ok(undefined, { armyId: id, conscripted: count });
}
