/*
 * Supply convoys — the delivery half of logistics (foraging is the other).
 *
 * Each turn every convoy rolls toward the army it is supplying. If it reaches
 * that army it unloads its food into the army's carried supply and is done; if
 * an enemy army is sitting on the convoy's tile it is captured and destroyed
 * (raid the supply line); if its target army has died or changed hands the
 * convoy disbands. Runs BEFORE foraging so fresh supply can be eaten the same
 * season.
 */

import { buildBritainTileMap, findTilePath, advanceWithinBudget } from '../maps/index.ts';
import { CONVOY_MOVEMENT_POINTS } from '../constants.ts';
import type { GameState } from '../types/realm.ts';

export type ConvoyStatus = 'enroute' | 'delivered' | 'intercepted' | 'lost';

export interface ConvoyOutcome {
  convoyId: string;
  ownerId: string;
  targetArmyId: string;
  food: number;
  status: ConvoyStatus;
  col: number;
  row: number;
}

export interface ConvoyLedger {
  convoys: ConvoyOutcome[];
}

/** Advance every convoy one turn: move, then intercept / deliver / continue. */
export function advanceConvoys(state: GameState): ConvoyLedger {
  const map = buildBritainTileMap();
  const convoys: ConvoyOutcome[] = [];

  for (const convoy of Object.values(state.convoys)) {
    const record = (status: ConvoyStatus): void => {
      convoys.push({
        convoyId: convoy.id, ownerId: convoy.ownerId, targetArmyId: convoy.targetArmyId,
        food: convoy.food, status, col: convoy.col, row: convoy.row,
      });
    };

    const army = state.armies[convoy.targetArmyId];
    if (!army || army.ownerId !== convoy.ownerId) {
      delete state.convoys[convoy.id]; // nobody left to supply
      record('lost');
      continue;
    }

    // Roll toward the army as far as a convoy can travel this turn.
    const path = findTilePath(map, { col: convoy.col, row: convoy.row }, { col: army.col, row: army.row });
    if (path && path.tiles.length >= 2) {
      const { index } = advanceWithinBudget(path, CONVOY_MOVEMENT_POINTS);
      const dest = path.tiles[index];
      convoy.col = dest.col;
      convoy.row = dest.row;
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

    // Reached the army → unload.
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
