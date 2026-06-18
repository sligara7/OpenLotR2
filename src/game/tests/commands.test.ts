/* Command protocol (commands/): validation, application, ownership, EndTurn. */

import { test, assert, assertEqual, assertClose } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { createWorld } from '../state/world.ts';
import { createRng } from '../rng.ts';
import { dispatch } from '../commands/dispatch.ts';
import { CastleType, FieldStatus, Industry, RationLevel } from '../types/enums.ts';
import { ALE_COST } from '../constants.ts';
import type { GameState } from '../types/realm.ts';

function world(): GameState {
  const me = createRealm({ id: 'p1', name: 'Me', isHuman: true, gold: 100 });
  const foe = createRealm({ id: 'p2', name: 'Foe' });
  const mine = createCounty({ id: 'mine', name: 'Mine', ownerId: 'p1', population: 1000, fieldCount: 4, grainSacks: 100, cows: 20 });
  const theirs = createCounty({ id: 'theirs', name: 'Theirs', ownerId: 'p2', population: 800 });
  const other = createCounty({ id: 'other', name: 'Other', ownerId: 'p1', population: 500 });
  return createWorld({ realms: [me, foe], counties: [mine, theirs, other], edges: [['mine', 'other']] });
}

const ctx = { actorRealmId: 'p1' };

test('command: SetTaxRate applies a valid rate', () => {
  const w = world();
  const r = dispatch(w, { type: 'SetTaxRate', countyId: 'mine', rate: 35 }, ctx);
  assert(r.ok, 'accepted');
  assertEqual(w.counties.mine.taxRate, 35, 'rate set');
});

test('command: SetTaxRate rejects out-of-range and unowned counties', () => {
  const w = world();
  assert(!dispatch(w, { type: 'SetTaxRate', countyId: 'mine', rate: 150 }, ctx).ok, 'range rejected');
  assert(!dispatch(w, { type: 'SetTaxRate', countyId: 'theirs', rate: 20 }, ctx).ok, 'ownership rejected');
});

test('command: SetTaxRate cannot raise taxes at zero happiness', () => {
  const w = world();
  w.counties.mine.happiness = 0;
  w.counties.mine.taxRate = 20;
  assert(!dispatch(w, { type: 'SetTaxRate', countyId: 'mine', rate: 40 }, ctx).ok, 'raise blocked');
  assert(dispatch(w, { type: 'SetTaxRate', countyId: 'mine', rate: 10 }, ctx).ok, 'lowering still allowed');
});

test('command: SetRation rejects an invalid level', () => {
  const w = world();
  assert(dispatch(w, { type: 'SetRation', countyId: 'mine', level: RationLevel.Double }, ctx).ok, 'valid level');
  assertEqual(w.counties.mine.wantedRation, RationLevel.Double, 'ration set');
  // deliberately bad payload (as could arrive over the wire)
  assert(!dispatch(w, { type: 'SetRation', countyId: 'mine', level: 'Lots' as RationLevel }, ctx).ok, 'bad level rejected');
});

test('command: SetLabourPolicy clamps to [0,1]', () => {
  const w = world();
  dispatch(w, { type: 'SetLabourPolicy', countyId: 'mine', industryShare: 5, grainBeefBalance: -2 }, ctx);
  assertEqual(w.counties.mine.labour.industryShare, 1, 'clamped high');
  assertEqual(w.counties.mine.labour.grainBeefBalance, 0, 'clamped low');
});

test('command: AssignField sets a usable field and clears any crop', () => {
  const w = world();
  w.counties.mine.fields[0].status = FieldStatus.Grain;
  w.counties.mine.fields[0].sacksPlanted = 5;
  const r = dispatch(w, { type: 'AssignField', countyId: 'mine', fieldIndex: 0, use: FieldStatus.Cattle }, ctx);
  assert(r.ok, 'accepted');
  assertEqual(w.counties.mine.fields[0].status, FieldStatus.Cattle, 're-tasked');
  assertEqual(w.counties.mine.fields[0].sacksPlanted, 0, 'crop cleared');
});

test('command: AssignField rejects damaged fields and bad indexes', () => {
  const w = world();
  w.counties.mine.fields[1].status = FieldStatus.Barren;
  assert(!dispatch(w, { type: 'AssignField', countyId: 'mine', fieldIndex: 1, use: FieldStatus.Grain }, ctx).ok, 'barren rejected');
  assert(!dispatch(w, { type: 'AssignField', countyId: 'mine', fieldIndex: 99, use: FieldStatus.Grain }, ctx).ok, 'bad index rejected');
});

test('command: BuildCastle starts a project and activates the build site', () => {
  const w = world();
  const r = dispatch(w, { type: 'BuildCastle', countyId: 'mine', design: CastleType.MotteAndBailey }, ctx);
  assert(r.ok, 'accepted');
  assertEqual(w.counties.mine.castle.type, CastleType.MotteAndBailey, 'design chosen');
  assertEqual(w.counties.mine.castle.buildProgress, 0, 'project reset to start');
  assert(w.counties.mine.industries[Industry.Castle].operational, 'build site active');
  assert(!dispatch(w, { type: 'BuildCastle', countyId: 'mine', design: CastleType.None }, ctx).ok, 'None rejected');
});

test('command: SendSupplies transfers food between owned counties', () => {
  const w = world();
  const r = dispatch(w, { type: 'SendSupplies', fromCountyId: 'mine', toCountyId: 'other', grainSacks: 40, cows: 5 }, ctx);
  assert(r.ok, 'accepted');
  assertEqual(w.counties.mine.food.grainSacks, 60, 'origin debited');
  assertEqual(w.counties.other.food.grainSacks, 40, 'destination credited');
  assertEqual(w.counties.other.food.cows, 5, 'cattle moved');
});

test('command: SendSupplies rejects over-sending and self-sends', () => {
  const w = world();
  assert(!dispatch(w, { type: 'SendSupplies', fromCountyId: 'mine', toCountyId: 'other', grainSacks: 9999 }, ctx).ok, 'too much grain');
  assert(!dispatch(w, { type: 'SendSupplies', fromCountyId: 'mine', toCountyId: 'mine', grainSacks: 1 }, ctx).ok, 'self-send');
});

test('command: BuyAle spends gold and grants a temporary boost', () => {
  const w = world();
  const r = dispatch(w, { type: 'BuyAle', countyId: 'mine' }, ctx);
  assert(r.ok, 'accepted');
  assertClose(w.realms.p1.treasury.gold, 100 - ALE_COST, 0.001, 'gold spent');
  assert(w.counties.mine.aleSeasons > 0, 'ale boost set');
});

test('command: EndTurn advances the world and returns a report', () => {
  const w = world();
  const rng = createRng(7);
  const before = w.turn;
  const r = dispatch(w, { type: 'EndTurn' }, { actorRealmId: 'p1', rng });
  assert(r.ok, 'accepted');
  assert(!!r.report, 'report returned');
  assertEqual(w.turn, before + 1, 'turn advanced');
  // EndTurn without an RNG is rejected.
  assert(!dispatch(world(), { type: 'EndTurn' }, { actorRealmId: 'p1' }).ok, 'needs rng');
});
