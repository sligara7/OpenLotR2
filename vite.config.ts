/*
 * Vite + Electron build (replaces the unmaintained electron-webpack).
 *
 *   - Renderer: Vite serves/builds src/renderer (its index.html is the entry).
 *   - Static game assets live in /static and are exposed at the web root via
 *     publicDir, so Phaser's loader paths (e.g. 'themes/classic/...') resolve.
 *   - Main process: vite-plugin-electron builds src/main/index.ts and, in dev,
 *     sets VITE_DEV_SERVER_URL + launches Electron pointing at the dev server.
 *
 * Run from the repo root (npm scripts), so process.cwd() is the repo root.
 */
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';
import { createRequire } from 'node:module';

const r = (p: string) => path.resolve(process.cwd(), p);
const pkg = createRequire(import.meta.url)(r('package.json'));

export default defineConfig({
  root: r('src/renderer'),
  publicDir: r('static'),
  // Relative base so file:// loading of the built index.html resolves assets.
  base: './',
  resolve: {
    alias: { '@': r('src') },
  },
  // Build-time constants consumed by the renderer (config.js).
  define: {
    __APP_TITLE__: JSON.stringify(pkg.title),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
  },
  build: {
    outDir: r('dist/renderer'),
    emptyOutDir: true,
  },
  plugins: [
    electron({
      main: {
        entry: r('src/main/index.ts'),
        vite: {
          build: {
            outDir: r('dist/main'),
            rollupOptions: {
              // Keep Electron-only native/runtime deps external (resolved from
              // node_modules at runtime / by electron-builder when packaging).
              external: ['about-window', 'electron'],
            },
          },
        },
      },
    }),
  ],
});
