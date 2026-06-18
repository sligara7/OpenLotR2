/* Field-usage command: assign a field to grain, cattle, or leave fallow. */

import { FieldStatus } from '../../types/enums.ts';
import { ok, err } from '../types.ts';
import type { AssignField, CommandContext, CommandResult } from '../types.ts';
import type { GameState } from '../../types/realm.ts';
import { findOwnedCounty } from './util.ts';

const ASSIGNABLE: readonly FieldStatus[] = [FieldStatus.Fallow, FieldStatus.Grain, FieldStatus.Cattle];
// A field can only be re-tasked while it is in a usable state; weather-damaged
// or barren fields must recover/be reclaimed first (Manual Part-3 "Field Usage").
const USABLE: readonly FieldStatus[] = [FieldStatus.Fallow, FieldStatus.Grain, FieldStatus.Cattle];

export function assignField(state: GameState, cmd: AssignField, ctx: CommandContext): CommandResult {
  const { county, error } = findOwnedCounty(state, cmd.countyId, ctx.actorRealmId);
  if (error || !county) return err(error!);

  const field = county.fields[cmd.fieldIndex];
  if (!field) return err(`No field at index ${cmd.fieldIndex}`);
  if (!ASSIGNABLE.includes(cmd.use)) return err(`Cannot assign field to ${cmd.use}`);
  if (!USABLE.includes(field.status)) {
    return err(`Field is ${field.status} and must be reclaimed before use`);
  }

  field.status = cmd.use;
  // Re-tasking clears any in-progress grain crop (Manual: changing an active
  // grain field destroys the crop).
  field.sacksPlanted = 0;
  field.grainGrowth = 0;
  return ok();
}
