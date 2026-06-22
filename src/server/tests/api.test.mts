/* HTTP endpoint tests — boot the real Express app on an ephemeral port and
 * drive it with fetch. Verifies the OpenAPI surface and the command flow. */

import { test, assert, assertEqual } from '../../game/testing/harness.ts';
import { createApp } from '../app.ts';
import { GameStore } from '../store.ts';
import type { AddressInfo } from 'net';

// Start a server for the whole suite; unref() so it never blocks process exit.
const server = createApp(new GameStore()).listen(0);
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
server.unref();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

// Node's fetch types json() as `unknown`; tests read bodies loosely.
const body = (res: Response): Promise<any> => res.json() as Promise<any>;

/** Create a fresh game, return its id. */
async function newGame(): Promise<string> {
  const res = await post('/api/games', { seed: 1 });
  return (await body(res)).gameId;
}

test('api: serves an OpenAPI 3.1 document', async () => {
  const res = await fetch(`${base}/openapi.json`);
  assertEqual(res.status, 200, 'status');
  const doc = await body(res);
  assertEqual(doc.openapi, '3.1.0', 'openapi version');
  assert(!!doc.paths['/api/games'], 'create path present');
  assert(!!doc.components.schemas.Command, 'Command schema component present');
});

test('api: POST /api/games creates a game with initial state', async () => {
  const res = await post('/api/games', { seed: 42 });
  assertEqual(res.status, 201, 'created');
  const json = await body(res);
  assert(typeof json.gameId === 'string', 'gameId returned');
  assertEqual(json.seed, 42, 'seed echoed');
  assertEqual(json.state.counties.york.name, 'York', 'demo world loaded');
});

test('api: GET state returns the authoritative state; 404 for unknown game', async () => {
  const id = await newGame();
  const ok = await fetch(`${base}/api/games/${id}/state`);
  assertEqual(ok.status, 200, 'state ok');
  const missing = await fetch(`${base}/api/games/nope/state`);
  assertEqual(missing.status, 404, 'unknown game 404');
});

test('api: a valid command is applied to state', async () => {
  const id = await newGame();
  const res = await post(`/api/games/${id}/commands`, { type: 'SetTaxRate', countyId: 'york', rate: 33 });
  assertEqual(res.status, 200, 'processed');
  assertEqual((await body(res)).ok, true, 'ok');
  const state = await body(await fetch(`${base}/api/games/${id}/state`));
  assertEqual(state.counties.york.taxRate, 33, 'tax rate updated');
});

test('api: a diplomacy command moves opinion and shows in state', async () => {
  const id = await newGame();
  const res = await post(`/api/games/${id}/commands`, { type: 'SendGift', toRealmId: 'p2', gold: 100 });
  assertEqual(res.status, 200, 'processed');
  assertEqual((await body(res)).ok, true, 'gift accepted');
  const state = await body(await fetch(`${base}/api/games/${id}/state`));
  assert(state.diplomacy.opinions.p2.p1 > 0, 'p2 now regards p1 more warmly');
});

test('api: a malformed command is rejected with 400 (Zod validation)', async () => {
  const id = await newGame();
  const res = await post(`/api/games/${id}/commands`, { type: 'SetTaxRate', countyId: 'york', rate: 999 });
  assertEqual(res.status, 400, 'schema rejects out-of-range rate');
});

test('api: a rule violation returns 200 with ok:false', async () => {
  const id = await newGame();
  // Kent belongs to p2; acting as p1 (default) is an ownership violation.
  const res = await post(`/api/games/${id}/commands`, { type: 'SetTaxRate', countyId: 'kent', rate: 20 });
  assertEqual(res.status, 200, 'request was well-formed');
  const json = await body(res);
  assertEqual(json.ok, false, 'rule rejection');
  assert(typeof json.error === 'string', 'error message present');
});

test('api: EndTurn advances the world and a report is retrievable', async () => {
  const id = await newGame();
  const res = await post(`/api/games/${id}/commands`, { type: 'EndTurn' });
  const json = await body(res);
  assertEqual(json.ok, true, 'turn ended');
  assert(!!json.report, 'report returned inline');
  const report = await fetch(`${base}/api/games/${id}/reports/0`);
  assertEqual(report.status, 200, 'turn 0 report stored');
  assertEqual((await body(report)).turn, 0, 'report is turn 0');
});

test('api: x-realm-id header lets the rival act on its own county', async () => {
  const id = await newGame();
  const res = await post(
    `/api/games/${id}/commands`,
    { type: 'SetTaxRate', countyId: 'kent', rate: 40 },
    { 'x-realm-id': 'p2' },
  );
  assertEqual((await body(res)).ok, true, 'p2 may tax Kent');
});

test('api: an EndTurn reports the counties that changed hands', async () => {
  const created = await body(await post('/api/games', { seed: 1, scenario: 'britain' }));
  const end = await body(await post(`/api/games/${created.gameId}/commands`, { type: 'EndTurn' }));
  assert(Array.isArray(end.captures), 'captures array present on EndTurn');
  assert(end.captures.length > 0, 'the AI rulers took ground on their first turn');
  assert(typeof end.captures[0].countyId === 'string' && 'ownerId' in end.captures[0], 'capture shape');
});

test('api: save → load resumes the game deterministically (RNG state preserved)', async () => {
  const id = await newGame();
  // Advance two turns so the RNG has moved well past its seed.
  for (let i = 0; i < 2; i++) await post(`/api/games/${id}/commands`, { type: 'EndTurn' });

  const save = await body(await fetch(`${base}/api/games/${id}/save`));
  assertEqual(save.version, 1, 'save carries a version');
  assert(typeof save.rng === 'number', 'the RNG state is captured');

  // Continue the ORIGINAL three more turns → the reference state.
  for (let i = 0; i < 3; i++) await post(`/api/games/${id}/commands`, { type: 'EndTurn' });
  const original = await body(await fetch(`${base}/api/games/${id}/state`));

  // Load the snapshot as a NEW game and run the SAME three turns.
  const loadRes = await post('/api/games/load', save);
  assertEqual(loadRes.status, 201, 'save loaded as a new game');
  const loadedId = (await body(loadRes)).gameId;
  for (let i = 0; i < 3; i++) await post(`/api/games/${loadedId}/commands`, { type: 'EndTurn' });
  const loaded = await body(await fetch(`${base}/api/games/${loadedId}/state`));

  // Compare by value, not key order (the loaded state passed through Zod, which
  // reorders keys; that's cosmetic — the simulation reproduced identically).
  const canon = (o: unknown): string => JSON.stringify(o, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v);
  assertEqual(canon(loaded), canon(original), 'the resumed run matches the original exactly');
});

test('api: save 404s for an unknown game; load rejects a malformed blob', async () => {
  assertEqual((await fetch(`${base}/api/games/nope/save`)).status, 404, 'unknown game has no save');
  assertEqual((await post('/api/games/load', { version: 1, seed: 1, rng: 0 })).status, 400, 'a save without state is rejected');
});
