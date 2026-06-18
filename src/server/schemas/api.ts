/*
 * Zod schemas for API envelopes: command results, game creation, errors.
 */
import { z } from './zod.ts';
import { GameStateSchema, TurnReportSchema } from './state.ts';

/** Result of dispatching a command. `report` is present for EndTurn. */
export const CommandResultSchema = z
  .object({
    ok: z.boolean(),
    error: z.string().optional(),
    report: TurnReportSchema.optional(),
  })
  .openapi('CommandResult');

/** Request body for creating a new game. */
export const CreateGameRequestSchema = z
  .object({
    /** Optional deterministic seed; the server picks one if omitted. */
    seed: z.number().int().optional(),
    /** Named scenario to load (only 'demo' for now). */
    scenario: z.enum(['demo']).optional().default('demo'),
  })
  .openapi('CreateGameRequest');

export const CreateGameResponseSchema = z
  .object({
    gameId: z.string(),
    seed: z.number().int(),
    state: GameStateSchema,
  })
  .openapi('CreateGameResponse');

export const ErrorResponseSchema = z
  .object({ error: z.string() })
  .openapi('ErrorResponse');
