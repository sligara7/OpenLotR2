/*
 *  Renderer entry point.
 *  =====================
 *
 *  The game is driven entirely by the API-backed SVG/DOM UI (game-controller →
 *  Hud + MapTilesSvg). That is the whole renderer: the original Phaser canvas —
 *  the legacy boot/menu/campaign/armoury art scenes, kept for a while behind
 *  `?phaser=1` — was retired along with its dependency and its art.
 */

import { startGameUI } from "./game-controller";

//  Start the API-driven control UI — this is the game.
void startGameUI();
