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

// Set VITE_NO_ELECTRON=1 to run the renderer as a plain web app (no Electron) —
// used for browser-based testing (Playwright) and quick UI iteration.
const noElectron = process.env.VITE_NO_ELECTRON === '1';

const electronPlugin = electron({
  main: {
    entry: r('src/main/index.ts'),
    vite: {
      build: {
        outDir: r('dist/main'),
        rollupOptions: { external: ['about-window', 'electron'] },
      },
    },
  },
});

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
  // Dev server proxies the API so the browser can call it same-origin (no CORS).
  // Target is overridable via VITE_API_TARGET (default :3000).
  server: {
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://localhost:3000',
      '/openapi.json': process.env.VITE_API_TARGET || 'http://localhost:3000',
    },
  },
  // The electron plugin builds the main process and (in dev) launches Electron;
  // omit it for web-only runs so Vite serves the renderer for the browser.
  plugins: noElectron ? [] : [electronPlugin],
});
