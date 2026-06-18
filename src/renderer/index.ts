/*
 *  `app` module
 *  ============
 *
 *  Provides the game initialization routine.
 */

//  Set up the global `Phaser` BEFORE importing config/scenes (they reference it
//  at module-evaluation time). ES module ordering guarantees this runs first.
import "./phaser-global";
import * as config from "./config";
import { startGameUI } from "./game-controller";

declare const Phaser: typeof import("phaser").default;

//  Start the API-driven control UI first — it must work regardless of whether
//  the Phaser canvas can initialize (e.g. headless browsers).
void startGameUI();

//  Boot the Phaser canvas (visuals). Failure here must not take down the UI.
export function boot() {
  try {
    // Spread into a plain object: `import * as config` is an ES module namespace
    // (null prototype), but Phaser's Config parser calls source.hasOwnProperty().
    return new Phaser.Game({ ...config } as unknown as Phaser.Types.Core.GameConfig);
  } catch (e) {
    console.error("Phaser failed to start (continuing with DOM UI):", e);
    return null;
  }
}

boot();
