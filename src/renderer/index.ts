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

declare const Phaser: typeof import("phaser").default;

//  Boot the game.
export function boot() {
  const game = new Phaser.Game(config as unknown as Phaser.Types.Core.GameConfig);

  return game;
}

boot();
