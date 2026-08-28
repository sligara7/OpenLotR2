/*
 * What a finished game is worth knowing about.
 *
 * The test suite answers "does it still run". These answer "does it still
 * play", which is a different question and the one every balance change has
 * been unable to settle: whether diminishing returns help, whether asymmetric
 * houses are fair, whether the economy has a ceiling, whether the AI can
 * finish a game. Each of those needs a number that moves when the design does.
 *
 * A measure is chosen on one rule: IT MUST BE ABLE TO EMBARRASS US. A number
 * that only ever goes up is decoration. "Nine games in ten were never decided"
 * and "one realm held four fifths of the map by year eight" are the kind of
 * facts worth building an instrument for.
 */

import type { GameState } from '../types/realm.ts';
import type { TurnReport } from '../engine.ts';
import { countiesOfRealm } from '../state/world.ts';
import { quote } from '../systems/merchants.ts';
import { TRADE_GOODS } from '../types/trade.ts';

/** How one realm ended up. */
export interface RealmResult {
  realmId: string;
  name: string;
  personality: string | null;
  eliminated: boolean;
  counties: number;
  population: number;
  gold: number;
  soldiers: number;
  /** Averaged over the realm's counties; 0 when it holds none. */
  happiness: number;
}

/** Everything one played-out game has to say. */
export interface GameResult {
  seed: number;
  /** True when the game reached a decision inside the turn cap. */
  decided: boolean;
  turns: number;
  winnerId: string | null;
  winnerPersonality: string | null;
  reason: string | null;

  realms: RealmResult[];

  /** Share of the map the largest realm held at the end, 0..1. A number near 1
   *  well before the end means the game was over long before it ended. */
  topShare: number;
  /** Turn at which the eventual winner first led on counties — how early the
   *  result was effectively settled. -1 when undecided. */
  leadTakenAt: number;

  // --- what the seasons did to people --------------------------------------
  plagues: number;
  revolts: number;
  /** Counties that spent a season below Normal rations — the famine measure. */
  hungrySeasons: number;
  deserters: number;
  /** Share of the purse the wage bill actually consumed, averaged over the
   *  game. Deserters staying at zero is only interesting once you know whether
   *  upkeep was ever close to biting: at a few percent, army size is limited by
   *  something other than money. */
  wagePressure: number;
  /** Turns on which at least one realm could not pay in full. */
  shortPaydays: number;

  // --- war -----------------------------------------------------------------
  siegesStarted: number;
  siegesWon: number;
  /** Sieges the besieger walked away from — a distinct kind of failure. */
  siegesAbandoned: number;
  assaultsRepulsed: number;

  // --- the economy ---------------------------------------------------------
  /** Goods whose price sat at the glut floor at the end, across the winner's
   *  realm. High means production outruns every sink. */
  goodsAtFloor: number;
  /** Goods at the scarcity ceiling — the opposite complaint. */
  goodsAtCeiling: number;
  /** Total materials the winner had piled up with nothing to spend them on. */
  hoard: number;
}

const PRICE_FLOOR = 0.21;
const PRICE_CEILING = 2.9;

/** Read one realm's standing off the finished world. */
export function realmResult(state: GameState, realmId: string): RealmResult {
  const realm = state.realms[realmId];
  const counties = countiesOfRealm(state, realmId);
  const soldiers = Object.values(state.armies)
    .filter((a) => a.ownerId === realmId)
    .reduce((s, a) => s + a.soldiers, 0);
  return {
    realmId,
    name: realm.name,
    personality: realm.personality,
    eliminated: realm.eliminated,
    counties: counties.length,
    population: Math.round(counties.reduce((s, c) => s + c.population, 0)),
    gold: Math.round(realm.treasury.gold),
    soldiers,
    happiness: counties.length
      ? Math.round(counties.reduce((s, c) => s + c.happiness, 0) / counties.length)
      : 0,
  };
}

/** Running tallies a game accumulates as it is played. */
export interface Tally {
  plagues: number;
  revolts: number;
  hungrySeasons: number;
  deserters: number;
  siegesStarted: number;
  siegesWon: number;
  siegesAbandoned: number;
  assaultsRepulsed: number;
  /** Wages owed across every realm, summed over the game. */
  wagesDue: number;
  /** Gold each realm held when the bill came, summed over the game. */
  pursesAtPayday: number;
  /** Turns on which at least one realm could not pay in full. */
  shortPaydays: number;
  /** realmId -> first turn it led the map on counties. */
  ledAt: Map<string, number>;
  /** Counties with a siege STANDING right now. A siege that ends and is later
   *  laid again is a second siege, which is what `seenSieges` used to get
   *  wrong: keyed by county for the whole game, it counted one start however
   *  often a county was fought over, so `siegesWon` could exceed
   *  `siegesStarted` — measured at 34 won against 16 started. */
  activeSieges: Set<string>;
}

export function emptyTally(): Tally {
  return {
    plagues: 0, revolts: 0, hungrySeasons: 0, deserters: 0,
    siegesStarted: 0, siegesWon: 0, siegesAbandoned: 0, assaultsRepulsed: 0,
    wagesDue: 0, pursesAtPayday: 0, shortPaydays: 0,
    ledAt: new Map(), activeSieges: new Set(),
  };
}

/** Fold one turn's report into the running tallies. */
export function tallyTurn(tally: Tally, state: GameState, report: TurnReport): void {
  for (const c of report.counties) {
    if (c.plague) tally.plagues += 1;
    if (c.revoltTriggered) tally.revolts += 1;
    // Anything below Normal means somebody went short this season.
    if (c.achievedRation !== 'Normal' && c.achievedRation !== 'Double' && c.achievedRation !== 'Triple') {
      tally.hungrySeasons += 1;
    }
  }
  let short = false;
  for (const w of report.wages.realms) {
    tally.deserters += w.deserted;
    tally.wagesDue += w.due;
    // What the purse held when the bill arrived: what was paid, plus whatever
    // survived paying it. `paid` is already capped by the purse.
    tally.pursesAtPayday += w.paid + (state.realms[w.realmId]?.treasury.gold ?? 0);
    if (w.deserted > 0) short = true;
  }
  if (short) tally.shortPaydays += 1;

  for (const s of report.siege.sieges) {
    if (!tally.activeSieges.has(s.countyId)) {
      tally.activeSieges.add(s.countyId);
      tally.siegesStarted += 1;
    }
    // `captured` is the unambiguous signal: 'lifted' means the besieger gave
    // up and went home, which is the opposite of winning.
    if (s.captured) tally.siegesWon += 1;
    if (s.status === 'lifted') tally.siegesAbandoned += 1;
    if (s.status === 'repulsed') tally.assaultsRepulsed += 1;
  }
  // Whatever is no longer in `state.sieges` has ended, however it ended — so
  // the next siege of that county counts as a new one. Read from live state
  // rather than inferred from `status`, because a siege also ends when the
  // besieging army is destroyed in a repulsed assault, and the ledger entry for
  // that says `repulsed` with `captured: false` like any other failed storm.
  for (const id of [...tally.activeSieges]) {
    if (!state.sieges[id]) tally.activeSieges.delete(id);
  }

  // Who leads the map right now? Recording the FIRST turn each realm led says
  // how early the eventual result was effectively settled.
  let bestId: string | null = null;
  let best = -1;
  for (const realm of Object.values(state.realms)) {
    const n = countiesOfRealm(state, realm.id).length;
    if (n > best) { best = n; bestId = realm.id; }
  }
  if (bestId && !tally.ledAt.has(bestId)) tally.ledAt.set(bestId, report.turn);
}

/** Price health across a realm's counties: how many goods are stuck at a bound. */
export function priceExtremes(state: GameState, realmId: string): { floor: number; ceiling: number } {
  const counties = countiesOfRealm(state, realmId);
  if (counties.length === 0) return { floor: 0, ceiling: 0 };
  let floor = 0;
  let ceiling = 0;
  for (const good of TRADE_GOODS) {
    const q = quote(state, counties[0].id, good, realmId);
    if (!q) continue;
    if (q.factor <= PRICE_FLOOR) floor += 1;
    if (q.factor >= PRICE_CEILING) ceiling += 1;
  }
  return { floor, ceiling };
}
