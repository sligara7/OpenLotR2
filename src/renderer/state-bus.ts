/*
 * Tiny state pub/sub. The controller publishes the latest GameState; views (the
 * DOM HUD and the Phaser map) subscribe. Keeps the canvas map and the control
 * panel in sync without coupling them to each other.
 */

import type { GameState } from '../game/types/realm.ts';

type Listener = (state: GameState) => void;

let latest: GameState | null = null;
const listeners = new Set<Listener>();

export const stateBus = {
  publish(state: GameState): void {
    latest = state;
    for (const listener of listeners) listener(state);
  },
  /** Subscribe; immediately receives the latest state if one exists. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (latest) listener(latest);
    return () => {
      listeners.delete(listener);
    };
  },
  get current(): GameState | null {
    return latest;
  },
};
