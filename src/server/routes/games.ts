/*
 * Game lifecycle + play routes. Thin layer: parse/validate with the Zod
 * schemas, then delegate to the simulation core's command protocol. The server
 * never reimplements game rules — it only owns transport, validation, and the
 * authoritative state.
 */

import { Router } from 'express';
import { dispatch, takeAiTurns } from '../../game/index.ts';
import { CommandSchema } from '../schemas/commands.ts';
import { CreateGameRequestSchema, SaveGameSchema } from '../schemas/api.ts';
import type { GameStore } from '../store.ts';

export function gamesRouter(store: GameStore): Router {
  const router = Router();

  // Create a new game.
  router.post('/games', (req, res) => {
    const parsed = CreateGameRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const seed = parsed.data.seed ?? (Date.now() & 0x7fffffff);
    const game = store.create(seed, parsed.data.scenario);
    res.status(201).json({ gameId: game.id, seed: game.seed, state: game.state });
  });

  // Download a portable save blob for a game.
  router.get('/games/:id/save', (req, res) => {
    const save = store.save(req.params.id);
    if (!save) {
      res.status(404).json({ error: 'No such game' });
      return;
    }
    res.json(save);
  });

  // Load a save blob as a new game.
  router.post('/games/load', (req, res) => {
    const parsed = SaveGameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const game = store.load(parsed.data);
    res.status(201).json({ gameId: game.id, seed: game.seed, state: game.state });
  });

  // Fetch current authoritative state.
  router.get('/games/:id/state', (req, res) => {
    const game = store.get(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'No such game' });
      return;
    }
    res.json(game.state);
  });

  // Submit a command.
  router.post('/games/:id/commands', (req, res) => {
    const game = store.get(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'No such game' });
      return;
    }
    const parsed = CommandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorRealmId = req.header('x-realm-id') ?? 'p1';
    const isEndTurn = parsed.data.type === 'EndTurn';
    // Snapshot county ownership so we can report what changed hands this turn.
    const owners = isEndTurn
      ? new Map(Object.values(game.state.counties).map((c) => [c.id, c.ownerId]))
      : null;
    // Single-host turn order: when the human ends the turn, the AI rulers take
    // theirs first (through the same dispatcher, bound by the same rules), then
    // the world ticks once for everyone.
    if (isEndTurn) takeAiTurns(game.state, game.rng);
    const result = dispatch(game.state, parsed.data, { actorRealmId, rng: game.rng });
    if (result.report) game.reports.push(result.report);

    if (owners) {
      const captures: { countyId: string; ownerId: string | null }[] = [];
      for (const c of Object.values(game.state.counties)) {
        if (owners.get(c.id) !== c.ownerId) captures.push({ countyId: c.id, ownerId: c.ownerId });
      }
      res.json({ ...result, captures });
    } else {
      res.json(result);
    }
  });

  // Fetch a past turn report.
  router.get('/games/:id/reports/:turn', (req, res) => {
    const game = store.get(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'No such game' });
      return;
    }
    const turn = Number(req.params.turn);
    const report = game.reports.find((r) => r.turn === turn);
    if (!report) {
      res.status(404).json({ error: 'No such turn' });
      return;
    }
    res.json(report);
  });

  return router;
}
