/*
 *  Renderer entry point.
 *  =====================
 *
 *  The game is driven entirely by the API-backed SVG/DOM UI (game-controller →
 *  Hud + MapTilesSvg). The original Phaser canvas (legacy menu/art scenes) is
 *  NOT part of that loop, so it is now opt-in: pass `?phaser=1` to boot it. It
 *  is dynamically imported so Phaser (~1MB) stays out of the default bundle, and
 *  its WebGL initialisation never runs (and never errors) in the normal game.
 */

import { startGameUI } from "./game-controller";

//  Start the API-driven control UI — this is the game.
void startGameUI();

//  Optionally boot the legacy Phaser canvas. Failure here must not take down the
//  UI; the WebGL render loop can also throw asynchronously, hence the guard plus
//  a global handler that swallows Phaser's framebuffer errors when it is on.
async function bootPhaser(): Promise<void> {
  await import("./phaser-global"); // sets the global `Phaser` the scenes expect
  const config = await import("./config");
  const Phaser = (globalThis as unknown as { Phaser: typeof import("phaser").default }).Phaser;
  try {
    // Spread into a plain object: an ES module namespace has a null prototype,
    // but Phaser's Config parser calls source.hasOwnProperty().
    new Phaser.Game({ ...config } as unknown as Phaser.Types.Core.GameConfig);
  } catch (e) {
    console.error("Phaser failed to start (continuing with DOM UI):", e);
  }
}

if (typeof location !== "undefined" && new URLSearchParams(location.search).has("phaser")) {
  void bootPhaser();
}
