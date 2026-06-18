/*
 * Playwright E2E config.
 *
 * Boots BOTH servers automatically: the API and the Vite web renderer (with its
 * /api proxy pointed at the API). Ports are env-overridable so the suite works
 * even where the default :3000 is taken (e.g. CI/sandbox — set OLR_API_PORT).
 */
import { defineConfig } from '@playwright/test';

const apiPort = process.env.OLR_API_PORT || '3000';
const webPort = process.env.OLR_WEB_PORT || '5173';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Generous assertion timeout: the first navigation pays Vite's cold-start
  // compile of Phaser (~1.2MB) before the HUD appears.
  expect: { timeout: 15_000 },
  use: { baseURL: `http://localhost:${webPort}` },
  webServer: [
    {
      command: `PORT=${apiPort} npm run api`,
      port: Number(apiPort),
      reuseExistingServer: true,
    },
    {
      command: `VITE_API_TARGET=http://localhost:${apiPort} npm run dev:web`,
      port: Number(webPort),
      reuseExistingServer: true,
    },
  ],
});
