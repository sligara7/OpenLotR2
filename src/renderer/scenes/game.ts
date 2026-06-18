/*
 * Game scene — the Phaser canvas layer (visuals/title for now).
 *
 * The API-driven control panel lives in game-controller.ts (DOM HUD), kept
 * separate from the canvas so the game UI works even when the renderer can't
 * initialize. The county map will move into this scene next.
 */

declare const Phaser: typeof import("phaser").default;

export default class Game extends Phaser.Scene {
  constructor() {
    super({ key: "Game", active: true });
  }

  create(): void {
    this.add.text(16, 16, "OpenLotR2", { color: "#e8dcc0", fontSize: "28px" });
    this.add.text(16, 52, "live from the simulation API", {
      color: "#c8b890",
      fontSize: "14px",
    });
  }
}
