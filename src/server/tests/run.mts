/*
 * Server test entry point (.mts = ESM, so top-level await works under tsx).
 *   npm run test:api   (or: tsx src/server/tests/run.mts)
 */

import './api.test.mts';
import { run } from '../../game/testing/harness.ts';

console.log('OpenLotR2 server — API test suite\n');
await run();
