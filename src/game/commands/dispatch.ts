/*
 * Command dispatcher — the single entry point a server calls per command.
 *
 *   const result = dispatch(state, command, { actorRealmId, rng });
 *
 * Validation lives inside each handler (validate-and-apply together), so an
 * invalid command leaves the state untouched and returns { ok:false, error }.
 * The discriminated `Command.type` keeps routing exhaustive and type-checked.
 */

import { err } from './types.ts';
import type { Command, CommandContext, CommandResult } from './types.ts';
import type { GameState } from '../types/realm.ts';

import { setTaxRate, setRation, setLabourPolicy } from './handlers/governance.ts';
import { assignField } from './handlers/fields.ts';
import { buildCastle } from './handlers/castle.ts';
import { sendSupplies, buyAle } from './handlers/logistics.ts';
import { moveArmy } from './handlers/army.ts';
import { attackArmy, laySiege } from './handlers/combat.ts';
import { setBlacksmith, conscript } from './handlers/conscription.ts';
import { endTurn } from './handlers/turn.ts';

export function dispatch(state: GameState, command: Command, ctx: CommandContext): CommandResult {
  switch (command.type) {
    case 'SetTaxRate': return setTaxRate(state, command, ctx);
    case 'SetRation': return setRation(state, command, ctx);
    case 'SetLabourPolicy': return setLabourPolicy(state, command, ctx);
    case 'AssignField': return assignField(state, command, ctx);
    case 'BuildCastle': return buildCastle(state, command, ctx);
    case 'SendSupplies': return sendSupplies(state, command, ctx);
    case 'BuyAle': return buyAle(state, command, ctx);
    case 'MoveArmy': return moveArmy(state, command, ctx);
    case 'AttackArmy': return attackArmy(state, command, ctx);
    case 'LaySiege': return laySiege(state, command, ctx);
    case 'SetBlacksmith': return setBlacksmith(state, command, ctx);
    case 'Conscript': return conscript(state, command, ctx);
    case 'EndTurn': return endTurn(state, ctx);
    default: {
      // Exhaustiveness guard: if a Command variant is added without a case,
      // TypeScript flags `command` as not assignable to `never` here.
      const _exhaustive: never = command;
      return err(`Unknown command: ${(_exhaustive as { type?: string }).type ?? 'unknown'}`);
    }
  }
}
