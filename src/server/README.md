# King of the Lands — Backend API (`src/server`)

A thin, **authoritative** REST service over the simulation core (`src/game`).
The server owns game state and transport; it never reimplements rules — every
mutation goes through the core's command protocol (`dispatch`). This is the
backend half of the frontend/backend split.

## Run it

```sh
npm run api        # start the server (PORT env, default 3000)
npm run api:dev    # same, with tsx watch/reload
npm run test:api   # boot the app on an ephemeral port and hit it with fetch
```

Then open:
- **Swagger UI:** http://localhost:3000/docs
- **OpenAPI spec:** http://localhost:3000/openapi.json

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/games` | Create a game (optional `seed`, `scenario`). Returns id + initial state. |
| `GET`  | `/api/games/{id}/state` | Current authoritative `GameState`. |
| `POST` | `/api/games/{id}/commands` | Submit a `Command`. `x-realm-id` header sets the acting realm (default `p1`). |
| `GET`  | `/api/games/{id}/reports/{turn}` | A past turn's `TurnReport`. |

**Status conventions:**
- `400` — malformed request (failed Zod validation).
- `404` — unknown game / turn.
- `200` with `{ ok: false, error }` — well-formed but **rule-rejected** (e.g.
  taxing a county you don't own). Domain rejections are not HTTP errors.
- `EndTurn` advances the world and returns the `TurnReport` inline.

```sh
# example
curl -X POST localhost:3000/api/games -d '{"seed":7}' -H 'content-type: application/json'
curl -X POST localhost:3000/api/games/g1/commands \
  -H 'content-type: application/json' \
  -d '{"type":"SetTaxRate","countyId":"york","rate":25}'
curl -X POST localhost:3000/api/games/g1/commands \
  -H 'content-type: application/json' -d '{"type":"EndTurn"}'
```

## Architecture

```
src/server/
  index.ts          start + listen
  app.ts            createApp(): wires middleware, routes, /docs, /openapi.json
  store.ts          in-memory GameStore (state + seed + RNG + reports per game)
  openapi.ts        builds the OpenAPI 3.1 doc from the Zod registry
  routes/games.ts   the REST handlers (parse -> dispatch -> respond)
  schemas/          Zod schemas — the SINGLE SOURCE OF TRUTH
    zod.ts          shared z with OpenAPI extension enabled
    enums.ts        z.nativeEnum bound to the core enum objects (no drift)
    commands.ts     Command request schemas + compile-time drift guard
    state.ts        GameState / TurnReport schemas + drift guards
    api.ts          CommandResult, CreateGame*, ErrorResponse
  tests/            api.test.mts + run.mts (ESM for top-level await under tsx)
```

### Code-first contract (single source of truth)

The Zod schemas in `schemas/` drive **both** runtime validation **and** the
generated OpenAPI spec. To prevent the wire format drifting from the simulation,
each schema carries a compile-time guard that asserts it is structurally
identical to the corresponding core type — e.g. in `schemas/commands.ts`:

```ts
type _CommandContractInSync = Expect<Equal<CommandInput, Command>>;
```

If the core `Command`, `GameState`, or `TurnReport` types change without the
schema (or vice-versa), `npm run typecheck` fails. So the spec can never silently
misrepresent the API.

## Building the frontend against this

Because the spec is OpenAPI 3.1, the Phaser client can consume a **generated,
typed client** (e.g. `openapi-typescript` + `openapi-fetch`, or `orval`) pointed
at `/openapi.json`. The client renders `GameState`, sends `Command`s, and never
holds game rules locally — the server stays authoritative.

## Future

- Persistence (nedb is already a dependency) instead of in-memory `GameStore`.
- Auth / sessions / per-realm authorization (today `x-realm-id` is trusted).
- Turn arbitration for multiplayer (advance only when all realms have ended).
- Live updates: SSE or WebSocket push of state diffs (REST stays the contract).
- More scenarios beyond `demo`; map/county data loaded from the Tiled `.tmx`.
