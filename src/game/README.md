# King of the Lands — Simulation Core (`src/game`)

A **headless, deterministic, dependency-free** model of the Lords of the Realm II
county economy: population, happiness, health, food/rations, labour, agriculture,
industry, taxes, immigration, and revolts. It has **no Phaser/Electron imports**
and is the single source of truth for game rules.

The mechanics are a faithful implementation of the in-repo manual
(`doc/game/Part-*.rst`, chiefly Part-3 "County Management"). The manual is
qualitative, so every balance number lives in [`constants.ts`](./constants.ts)
with a citation, ready to tune.

## Why it's shaped this way

Two project goals drove the design:

1. **Faithful remake first** — systems mirror the manual's documented
   relationships before any new features are layered on.
2. **Frontend/backend split, eventually hosted online** — so the core is built
   as an **authoritative backend simulation**: pure state + pure transition
   functions, fully serialisable (`GameState` is plain data), and deterministic
   given a seed. The Phaser renderer is just one possible client. See
   [Client/server roadmap](#clientserver-roadmap).

## Directory map

```
src/game/
  index.ts            Public API barrel — clients import ONLY from here
  constants.ts        ALL tunable balance numbers, each cited to the manual
  rng.ts              Seeded deterministic RNG (never Math.random)
  engine.ts           advanceSeason(): the ordered per-turn pipeline
  demo.ts             Runnable headless scenario (prints seasons)
  commands/           Command protocol — the client/server API boundary
    types.ts          Command union (JSON intents) + CommandContext/Result
    dispatch.ts       dispatch(state, command, ctx): route -> validate -> apply
    handlers/         One file per concern (governance, fields, castle, ...)
  types/              Pure data shapes (no logic)
    enums.ts          Season, RationLevel, FieldStatus, HealthLevel, ...
    county.ts         County, Field, Castle, LabourPolicy, ...
    realm.ts          Realm, Treasury, GameState, Adjacency
  state/              Constructors + tiny pure helpers
    county.ts  realm.ts  world.ts
  systems/            One seasonal concern per file (single responsibility)
    labour.ts         policy -> head-count per task
    production.ts     agriculture (grain cycle, cattle/dairy) + industry
    food.ts           rations: dairy -> grain/beef, achieved ration
    health.ts         ration/plague -> 0..100 health -> 5 levels
    happiness.ts      per-factor happiness deltas (the Happiness Report)
    population.ts      births, deaths, emigration (intra-county)
    immigration.ts    inter-county flow along the happiness gradient
    taxes.ts          revenue -> shared treasury (castle bonus)
    revolt.ts         unrest countdown -> losing the county
    foraging.ts       armies eat the occupied county's food (or starve)
    combat.ts         combined-arms battle resolution (unit matchups + RNG)
    siege.ts          multi-season siege of a garrisoned castle (storm/starve)
    conquest.ts       ownership transfer + realm elimination
  testing/harness.ts  Minimal zero-dependency test runner
  tests/              One *.test.ts per feature + run.ts entry
```

**Architecture rules** (per project preference for non-monolithic code):
- `types/` holds data only; `systems/` holds logic only; `state/` builds data.
- Each system is independently testable and imports only what it needs.
- Clients depend on `index.ts`, never on individual system files.

## The seasonal pipeline (`engine.ts`)

Order matters and follows the manual (ration drives health, health feeds
happiness, taxes are collected before population changes):

```
per county:  labour → production → food → health → happiness → taxes
             → population → revolt
world:       immigration → foraging → sieges
then:        calendar tick (Spring→Summer→Fall→Winter, year++ after Winter)
```

**Foraging** (`systems/foraging.ts`) runs after counties have fed their own
people: each army eats grain then beef from the county it occupies
(`army.countyId`), drawing the stores down — so an occupying force weakens the
land it sits on, friend or foe. A county that can't meet the army's appetite
starves a fraction of its soldiers; an army at zero soldiers is destroyed.

## Combat & conquest

Armies maneuver on a **movement budget** (`ARMY_MOVEMENT_POINTS`, reset each turn):
`MoveArmy` marches as far along the pathfound route as the budget allows — a plain
tile costs 1, a river crossing more — and halts partway if the destination is out
of range, so distance and terrain shape strategy.

A county changes hands two ways. An **undefended** county (no castle, or a castle
with no garrison) is captured simply by occupying its town — `MoveArmy` flips it.
A **garrisoned castle** can only be taken by **siege** (`LaySiege`): the besieger
invests the county for several seasons, battering the walls (faster the larger
the army, per the manual) while foraging starves the garrison, until the castle
is **stormed** (an assault, resolved as a battle with the defenders fighting at a
wall-strength multiplier) or **starved** into surrender. Sieges run last in the
pipeline, after foraging, so a county a besieger has stripped this season starves
its garrison the same season. Field battles between armies (`AttackArmy`) and
siege assaults share one **auto-resolved combined-arms** model
(`systems/combat.ts`): an army is a **composition** of unit types (peasant,
maceman, pikeman, archer, crossbowman, swordsman, knight — `UNIT_SPEC`), and each
side's power sums attack × a **matchup multiplier** against the enemy's mix
(`UNIT_MATCHUP`: archers shred the unarmored but glance off plate, crossbows
punch through armour and unhorse knights, macemen run down missile troops, pikes
brace against cavalry), × terrain/wall modifiers × a seeded swing. Casualties
scale with the enemy's power share and are distributed across the loser's units
by vulnerability. `Army.units` is the source of truth; `Army.soldiers` is its
denormalised total (kept in sync by `state/army.ts`).

**Raising troops** (`commands/handlers/conscription.ts`): a county's blacksmith
forges one weapon type (`SetBlacksmith`) from the realm's iron+wood into the
shared armory (`treasury.weapons`); `Conscript` then turns county population into
soldiers — peasants for free, everyone else drawing a matching weapon from the
armory — mustering a new army at the town or reinforcing one in place. It costs
population (off the labour pool) and morale (the manual's rule: you can't draft so
many that happiness would fall below zero), and a new army needs at least 50.
Mercenaries, wages and desertion are still to come.

**Winning** (`systems/conquest.ts` `evaluateOutcome`, checked each turn and stored
on `GameState.outcome`): the game is decided when a realm holds a supermajority of
all counties (`VICTORY_COUNTY_FRACTION`, *conquest*), when only one realm survives
(*last-standing*), or — for the single-player game — when the human is eliminated
(*defeat*); no survivors is *extinction*. Once `outcome` is set, `EndTurn` is
refused and the client shows a victory/defeat banner.

Supply convoys (feeding armies across friendly tiles, intercepting enemy convoys)
remain a queued logistics step; a few sea-isolated counties await ferries.

## Running it

```sh
npm install        # one-time (see note below if you skipped native rebuild)
npm run sim        # watch a 4-year headless run
npm run test:sim   # run all tests
npm run typecheck  # type-check the sim core (TS 5.9, strict)
npm run lint       # ESLint 9 (strict on src/game, lenient on legacy code)
```

Both scripts use [`tsx`](https://github.com/privatenumber/tsx) (a devDependency)
to run the `.ts` sources directly — the core is intentionally runnable without
the Phaser/webpack build.

> **Install note:** the dead `dplay` file-dependency that used to break
> `npm install` has been removed. If `npm install` stalls on the
> `electron-builder install-app-deps` postinstall (a native rebuild only needed
> for *packaging* the desktop app), run `npm install --ignore-scripts` — the sim
> core, tests, and server need no native modules.

## Tests

`tests/run.ts` runs one suite per feature (labour, production, food, health,
happiness, population, immigration, taxes, revolt) plus an engine integration
suite (invariants, calendar, determinism). 25 cases, all passing. Add a feature
→ add a `*.test.ts` and an import line in `run.ts`.

## Known balance gaps (a tuning pass is owed)

The manual gives no numbers, so constants are educated placeholders. The least
settled:

- **Starting self-sufficiency — fixed.** Counties once out-ate their farms (grain
  fields scaled with rare wheat tiles, population with land area) and the whole
  Britain map famined to extinction by year two. Scenarios now derive a county's
  grain-field count from its population (`FOOD_SURPLUS_TARGET`,
  `STARTING_FOOD_SEASONS`) so every county begins able to feed itself with a
  surplus. Guarded by `tests/balance.test.ts`.
- **Carrying-capacity boom-bust.** Field count is fixed at scenario start but
  population grows with happiness, so a thriving county overshoots what its farms
  feed, famines, and rebounds — a Malthusian oscillation. Emergent and arguably a
  feature (population pressure motivates expansion), but the swings are violent;
  smoothing wants a population-growth damping or letting rulers add fields freely.
- **Happiness** is additive-with-clamp; it can peg at 0/100. Consider moving it
  toward a computed target instead (noted in `happiness.ts`).
- **Emigration vs immigration** overlap conceptually (noted in `population.ts`).

## Where to extend (maps to the upgrade goals)

- **Castles / castle designer** — `CASTLE_SPEC` + `production.ts` castle build
  already exist; add a placement/editor grid and siege model.
- **Roads / villages / farms / new produce & animals** — extend `Field`/
  `FieldStatus` and add `systems/` modules; tile placement belongs to a future
  `world`/map layer fed by the Tiled `.tmx` maps.
- **Smarter AI rulers** — add `ai/` consuming this core's public API; the
  manual's Part-7 personalities (Knight/Countess/Bishop/Baron) are already
  enumerated in `NoblePersonality`.
- **Better population/immigration dynamics** — `population.ts` + `immigration.ts`
  are the levers; richer models drop in behind the same interfaces.

## Command protocol (`commands/`)

The boundary between client and server. A `Command` is a plain-JSON player
intent discriminated by `type`; `dispatch(state, command, ctx)` routes it to a
handler that **validates and applies** it (or returns `{ ok:false, error }`
leaving state untouched). `ctx.actorRealmId` enforces ownership.

Implemented commands: `SetTaxRate`, `SetRation`, `SetLabourPolicy`,
`AssignField`, `BuildCastle`, `SendSupplies`, `BuyAle`, `MoveArmy`, `AttackArmy`,
`LaySiege`, `SetBlacksmith`, `Conscript`, `EndTurn`. `EndTurn` advances the world
via `advanceSeason` and returns the `TurnReport`. `AttackArmy` (and `EndTurn`)
need `ctx.rng`.

```ts
import { dispatch, createRng } from './game';
const rng = createRng(seed);
dispatch(state, { type: 'SetTaxRate', countyId: 'york', rate: 25 }, { actorRealmId: 'p1' });
dispatch(state, { type: 'EndTurn' }, { actorRealmId: 'p1', rng });
```

FUTURE commands (need systems that don't exist yet): merchant Buy/Sell,
Conscript/DisbandArmy, GarrisonCastle, SupplyArmy. Add a variant to the `Command`
union and a handler under `commands/handlers/`.

## Client/server roadmap

The longer-term goal is a hosted, online game with a clean frontend/backend
split. This core is the backend's heart. Target shape:

```
src/game/        ← shared authoritative simulation + command protocol  [DONE]
src/server/      ← Node service: holds GameState, receives commands, calls
                   dispatch(), broadcasts state diffs. Decides WHEN to tick
                   (e.g. once every realm has sent EndTurn). Grows out of the
                   existing Express/Socket.io stub in src/main.
src/client/      ← Phaser renderer (today's src/renderer): renders state,
                   sends commands, never mutates rules locally.
```

Because `GameState` is plain serialisable data, `advanceSeason`/`dispatch` are
deterministic transitions, and commands are JSON, the same core runs
**server-authoritative** (server simulates, clients render + send commands) and
is amenable to lockstep. The command protocol above IS that shared API boundary;
the next step is the thin `src/server` socket layer that calls `dispatch`.
