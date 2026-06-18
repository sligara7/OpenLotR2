/*
 * Game scene — renders the Great Britain map on the canvas.
 *
 * Draws each county from its (col,row) on the BRITAIN map, coloured by its
 * owner in the live GameState (from the state bus). Tiles are clickable and
 * report the county to the controller (which shows details in the HUD).
 *
 * Kept tolerant of headless environments: if Phaser can't initialise, the DOM
 * HUD still works (the controller doesn't depend on this scene).
 */

import { BRITAIN } from "../../game/maps/index.ts";
import { stateBus } from "../state-bus.ts";
import { selectCounty } from "../game-controller.ts";
import type { GameState } from "../../game/types/realm.ts";

declare const Phaser: typeof import("phaser").default;

const OWNER_COLOR: Record<string, number> = {
  p1: 0x3a6ea5, // player — blue
  p2: 0xa53a3a, // Scots — red
  p3: 0x3aa55a, // Welsh — green
};
const NEUTRAL = 0x5c5246;
const CELL_W = 30;
const CELL_H = 18;
const ORIGIN_X = 26;
const ORIGIN_Y = 24;

export default class Game extends Phaser.Scene {
  private tiles: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: "Game", active: true });
  }

  create(): void {
    this.add.text(12, 6, "Great Britain", { color: "#e8dcc0", fontSize: "15px" });
    stateBus.subscribe((state) => this.drawMap(state));
  }

  private drawMap(state: GameState): void {
    for (const obj of this.tiles) obj.destroy();
    this.tiles = [];

    for (const region of BRITAIN.regions) {
      const county = state.counties[region.id];
      const owner = county?.ownerId ?? null;
      const color = owner && OWNER_COLOR[owner] ? OWNER_COLOR[owner] : NEUTRAL;

      const x = ORIGIN_X + region.col * CELL_W;
      const y = ORIGIN_Y + region.row * CELL_H;

      const tile = this.add
        .rectangle(x, y, CELL_W - 2, CELL_H - 2, color)
        .setOrigin(0)
        .setStrokeStyle(1, 0x2a2018)
        .setInteractive();
      tile.on("pointerover", () => tile.setStrokeStyle(2, 0xffe9a8));
      tile.on("pointerout", () => tile.setStrokeStyle(1, 0x2a2018));
      tile.on("pointerdown", () => selectCounty(region.id));

      const label = this.add.text(x + 2, y + 2, region.name.slice(0, 4), {
        color: "#f0e8d8",
        fontSize: "9px",
      });

      this.tiles.push(tile, label);
    }
  }
}
