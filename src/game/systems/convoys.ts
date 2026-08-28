/*
 * Supply convoys — the delivery half of logistics (foraging is the other).
 *
 * Each turn every convoy rolls toward the army it is supplying, EATING AS IT
 * GOES — the escort, the carters and the draught animals all live on the cargo,
 * so what arrives is always less than what set out and falls with distance.
 * That is the central fact of pre-modern logistics: past some range a column
 * consumes everything it carries, which puts a hard, computable radius on where
 * a realm can sustain a campaign at all.
 *
 * If it reaches its army it unloads whatever survived; if an enemy is sitting on
 * its tile it is captured and destroyed (raid the supply line); if it has eaten
 * itself hollow it is struck from the map; if its target army has died or
 * changed hands it disbands. Runs BEFORE foraging so fresh supply can be eaten
 * the same season.
 */

import { buildBritainTileMap, findTilePath, advanceWithinBudget } from '../maps/index.ts';
import {
  CONVOY_CONSUMPTION_PER_TILE,
  CONVOY_MINIMUM_LOAD,
  CONVOY_MOVEMENT_POINTS,
} from '../constants.ts';
import type { GameState } from '../types/realm.ts';

export type ConvoyStatus = 'enroute' | 'delivered' | 'intercepted' | 'lost' | 'consumed';

export interface ConvoyOutcome {
  convoyId: string;
  ownerId: string;
  targetArmyId: string;
  food: number;
  status: ConvoyStatus;
  col: number;
  row: number;
  /** Portions the column's own escort and animals ate this turn. */
  eaten: number;
}

export interface ConvoyLedger {
  convoys: ConvoyOutcome[];
}

/** Advance every convoy one turn: move, then intercept / deliver / continue. */
export function advanceConvoys(state: GameState): ConvoyLedger {
  const map = buildBritainTileMap();
  const convoys: ConvoyOutcome[] = [];

  for (const convoy of Object.values(state.convoys)) {
    let eaten = 0;
    const record = (status: ConvoyStatus): void => {
      convoys.push({
        convoyId: convoy.id, ownerId: convoy.ownerId, targetArmyId: convoy.targetArmyId,
        food: convoy.food, status, col: convoy.col, row: convoy.row, eaten,
      });
    };

    const army = state.armies[convoy.targetArmyId];
    if (!army || army.ownerId !== convoy.ownerId) {
      delete state.convoys[convoy.id]; // nobody left to supply
      record('lost');
      continue;
    }

    // Roll toward the army as far as a convoy can travel this turn — and eat as
    // it goes. THE COLUMN IS FED FROM ITS OWN CARGO: escort, carters and draught
    // animals all live on what they are hauling, so what arrives is always less
    // than what set out, and less the further it came. Past a certain distance
    // the wagon consumes everything and there was never any point setting out.
    const path = findTilePath(map, { col: convoy.col, row: convoy.row }, { col: army.col, row: army.row });
    if (path && path.tiles.length >= 2) {
      const { index } = advanceWithinBudget(path, CONVOY_MOVEMENT_POINTS);
      const dest = path.tiles[index];
      convoy.col = dest.col;
      convoy.row = dest.row;

      const before = convoy.food;
      convoy.food *= Math.pow(1 - CONVOY_CONSUMPTION_PER_TILE, index);
      eaten = before - convoy.food;
    }

    // Eaten itself hollow: the column turned back, or simply never arrived.
    if (convoy.food < CONVOY_MINIMUM_LOAD) {
      delete state.convoys[convoy.id];
      convoy.food = 0;
      record('consumed');
      continue;
    }

    // Ambushed where it now stands?
    const enemy = Object.values(state.armies).some(
      (a) => a.ownerId !== convoy.ownerId && a.col === convoy.col && a.row === convoy.row,
    );
    if (enemy) {
      delete state.convoys[convoy.id];
      record('intercepted');
      continue;
    }

    // Reached the army → unload whatever survived the journey.
    if (convoy.col === army.col && convoy.row === army.row) {
      army.supply += convoy.food;
      delete state.convoys[convoy.id];
      record('delivered');
      continue;
    }

    record('enroute');
  }

  return { convoys };
}
