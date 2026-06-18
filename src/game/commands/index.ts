/* Public surface of the command protocol. */

export { dispatch } from './dispatch.ts';
export type {
  Command,
  CommandContext,
  CommandResult,
  SetTaxRate,
  SetRation,
  SetLabourPolicy,
  AssignField,
  BuildCastle,
  SendSupplies,
  BuyAle,
  EndTurn,
} from './types.ts';
