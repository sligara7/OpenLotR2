/*
 * Express app factory. Kept separate from index.ts (which listens) so tests can
 * exercise the app without binding a port if they prefer.
 *
 * Routes:
 *   POST /api/games                      create a game
 *   GET  /api/games/:id/state            authoritative state
 *   POST /api/games/:id/commands         submit a command
 *   GET  /api/games/:id/reports/:turn    a past turn report
 *   GET  /openapi.json                   the generated spec
 *   GET  /docs                           Swagger UI
 */

import express from 'express';
import type { ErrorRequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { GameStore } from './store.ts';
import { gamesRouter } from './routes/games.ts';
import { buildOpenApiDocument } from './openapi.ts';

export function createApp(store: GameStore = new GameStore()): express.Express {
  const app = express();
  // A full game state (save blob) runs to a few hundred KB on the Britain map,
  // past the body parser's 100kb default — raise the limit so /games/load works.
  app.use(express.json({ limit: '8mb' }));

  const openapi = buildOpenApiDocument();
  app.get('/openapi.json', (_req, res) => {
    res.json(openapi);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  app.use('/api', gamesRouter(store));

  // Catch malformed JSON bodies and other errors as 400s.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Bad request' });
  };
  app.use(errorHandler);

  return app;
}
