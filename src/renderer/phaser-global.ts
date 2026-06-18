/*
 * Exposes Phaser as a global.
 *
 * The legacy scenes (boot.js, loader.js, ...) and config.js reference a global
 * `Phaser` (e.g. `class Boot extends Phaser.Scene`). Under electron-webpack
 * that global came from a CDN <script>. Now Phaser is an npm module, so we make
 * it global here. index.ts imports THIS module first, and ES module evaluation
 * order guarantees the global is set before config.js / the scenes evaluate.
 */
import Phaser from 'phaser';

(globalThis as unknown as { Phaser: typeof Phaser }).Phaser = Phaser;
