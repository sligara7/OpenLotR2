/*
 * Zod schemas for API envelopes: command results, game creation, errors.
 */
import { z } from './zod.ts';
import { GameStateSchema, TurnReportSchema } from './state.ts';

/** Result of dispatching a command. `report` (and `captures`, the counties that
 *  changed hands during the turn — AI conquests and fallen sieges) are present
 *  for EndTurn. */
export const CommandResultSchema = z
  .object({
    ok: z.boolean(),
    error: z.string().optional(),
    report: TurnReportSchema.optional(),
    captures: z
      .array(z.object({ countyId: z.string(), ownerId: z.string().nullable() }))
      .optional(),
    /** Diplomatic shifts across an EndTurn — each entry is a realm-pair key
     *  "a|b". Lets the client narrate alliances formed/broken and new enmities. */
    diplomacy: z
      .object({
        newAlliances: z.array(z.string()),
        brokenAlliances: z.array(z.string()),
        newEnemies: z.array(z.string()),
      })
      .optional(),
  })
  .openapi('CommandResult');

/** Request body for creating a new game. */
export const CreateGameRequestSchema = z
  .object({
    /** Optional deterministic seed; the server picks one if omitted. */
    seed: z.number().int().optional(),
    /** Named scenario to load. */
    scenario: z.enum(['demo', 'britain']).optional().default('demo'),
    /** Advanced Farming (Manual Part-8): seasonal grain labour, weather, fertility. */
    advancedFarming: z.boolean().optional().default(false),
    /** Exploration / fog of war (Manual Part-8): see only what you have explored. */
    exploration: z.boolean().optional().default(false),
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

/** A portable save: the full game state plus the RNG state to resume it. */
export const SaveGameSchema = z
  .object({
    version: z.number().int(),
    seed: z.number().int(),
    rng: z.number().int(),
    state: GameStateSchema,
  })
  .openapi('SaveGame');
