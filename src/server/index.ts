/*
 * Server entry point. Run with `npm run api` (tsx).
 */

import { createApp } from './app.ts';

const port = Number(process.env.PORT) || 3000;

createApp().listen(port, () => {
  console.log(`OpenLotR2 API listening on http://localhost:${port}`);
  console.log(`  Swagger UI:   http://localhost:${port}/docs`);
  console.log(`  OpenAPI spec: http://localhost:${port}/openapi.json`);
});
