/*
 * Test entry point. Imports every *.test.ts suite (which register their cases
 * as a side effect) then runs them.
 *
 * Run with:  node --experimental-strip-types src/game/tests/run.ts
 * (or via the npm "test:sim" script.)
 */

import './labour.test.ts';
import './production.test.ts';
import './food.test.ts';
import './health.test.ts';
import './happiness.test.ts';
import './population.test.ts';
import './immigration.test.ts';
import './taxes.test.ts';
import './revolt.test.ts';
import './engine.test.ts';
import './commands.test.ts';
import './maps.test.ts';
import './tiles.test.ts';
import './hex.test.ts';
import './movement.test.ts';
import './ferries.test.ts';
import './army.test.ts';
import './foraging.test.ts';
import './convoys.test.ts';
import './ai.test.ts';
import './balance.test.ts';
import './combat.test.ts';
import './siege.test.ts';
import './conscription.test.ts';
import './mercenaries.test.ts';
import './wages.test.ts';
import './army-manage.test.ts';
import './outcome.test.ts';
import './diplomacy.test.ts';
import './farming.test.ts';

import { run } from '../testing/harness.ts';

console.log('King of the Lands simulation core — test suite\n');
run();
