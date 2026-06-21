/*
 * OpenAPI 3.1 document, generated from the Zod schemas (single source of
 * truth). The path declarations here describe the same endpoints that
 * routes/games.ts implements; both validate against the very same schemas, so
 * the docs and the runtime cannot disagree about request/response shapes.
 */

import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from './schemas/zod.ts';
import { CommandSchema } from './schemas/commands.ts';
import { GameStateSchema, TurnReportSchema } from './schemas/state.ts';
import {
  CommandResultSchema,
  CreateGameRequestSchema,
  CreateGameResponseSchema,
  ErrorResponseSchema,
  SaveGameSchema,
} from './schemas/api.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  // Register named component schemas (nested ones are pulled in via their refs).
  registry.register('Command', CommandSchema);
  registry.register('CommandResult', CommandResultSchema);
  registry.register('GameState', GameStateSchema);
  registry.register('TurnReport', TurnReportSchema);
  registry.register('CreateGameRequest', CreateGameRequestSchema);
  registry.register('CreateGameResponse', CreateGameResponseSchema);
  registry.register('ErrorResponse', ErrorResponseSchema);
  registry.register('SaveGame', SaveGameSchema);

  const gameIdParam = z.object({ id: z.string().openapi({ example: 'g1', param: { name: 'id', in: 'path' } }) });

  registry.registerPath({
    method: 'post',
    path: '/api/games',
    tags: ['games'],
    summary: 'Create a new game',
    request: { body: json(CreateGameRequestSchema) },
    responses: {
      201: { description: 'Game created', ...json(CreateGameResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/games/{id}/state',
    tags: ['games'],
    summary: 'Fetch the current authoritative game state',
    request: { params: gameIdParam },
    responses: {
      200: { description: 'Current state', ...json(GameStateSchema) },
      404: { description: 'No such game', ...json(ErrorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/games/{id}/commands',
    tags: ['games'],
    summary: 'Submit a player command',
    description:
      'Validates and applies a command against the authoritative state. Domain ' +
      'rejections (e.g. illegal move) return 200 with { ok:false, error }. The ' +
      'acting realm is taken from the `x-realm-id` header (defaults to p1). For ' +
      'EndTurn the response includes the turn report.',
    request: {
      params: gameIdParam,
      headers: z.object({ 'x-realm-id': z.string().optional() }),
      body: json(CommandSchema),
    },
    responses: {
      200: { description: 'Command processed (see ok/error)', ...json(CommandResultSchema) },
      400: { description: 'Malformed command', ...json(ErrorResponseSchema) },
      404: { description: 'No such game', ...json(ErrorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/games/{id}/save',
    tags: ['games'],
    summary: 'Download a portable save blob',
    request: { params: gameIdParam },
    responses: {
      200: { description: 'The save blob', ...json(SaveGameSchema) },
      404: { description: 'No such game', ...json(ErrorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/games/load',
    tags: ['games'],
    summary: 'Load a save blob as a new game',
    request: { body: json(SaveGameSchema) },
    responses: {
      201: { description: 'Game loaded', ...json(CreateGameResponseSchema) },
      400: { description: 'Malformed save', ...json(ErrorResponseSchema) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/games/{id}/reports/{turn}',
    tags: ['games'],
    summary: 'Fetch a past turn report',
    request: {
      params: z.object({
        id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
        turn: z.coerce.number().int().openapi({ param: { name: 'turn', in: 'path' } }),
      }),
    },
    responses: {
      200: { description: 'The turn report', ...json(TurnReportSchema) },
      404: { description: 'No such game or turn', ...json(ErrorResponseSchema) },
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'King of the Lands API',
      version: '0.1.0',
      description:
        'REST API over the King of the Lands simulation core. Commands are the player ' +
        'action protocol; the server is authoritative for all game state.',
    },
    servers: [{ url: '/' }],
  });
}
