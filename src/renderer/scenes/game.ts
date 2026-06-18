/*
 * Game scene — Phaser canvas layer.
 *
 * The strategic county map is now an SVG/DOM layer (ui/map-svg.ts), which is
 * crisp, clickable and testable. This scene is kept minimal for now; Phaser is
 * retained for the future battle view (where sprites/animation suit canvas).
 */

declare const Phaser: typeof import("phaser").default;

export default class Game extends Phaser.Scene {
  constructor() {
    super({ key: "Game", active: true });
  }

  create(): void {
    // Intentionally minimal — the map is rendered as SVG over the canvas.
  }
}
