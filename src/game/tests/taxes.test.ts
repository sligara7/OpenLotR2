/* Taxes (systems/taxes.ts). */

import { test, assertClose } from '../testing/harness.ts';
import { createCounty } from '../state/county.ts';
import { createRealm } from '../state/realm.ts';
import { collectTaxes } from '../systems/taxes.ts';
import { CastleType } from '../types/enums.ts';

test('taxes: revenue scales with population and rate', () => {
  const realm = createRealm({ id: 'p1', name: 'Player', gold: 200 });
  const c = createCounty({ id: 'a', name: 'A', population: 1000, taxRate: 50, ownerId: 'p1' });
  const gold = collectTaxes(c, realm); // 1000 * 0.5 * 0.05 = 25
  assertClose(gold, 25, 0.001, 'collected gold');
  assertClose(realm.treasury.gold, 225, 0.001, 'treasury credited');
});

test('taxes: a completed castle boosts revenue', () => {
  const realm = createRealm({ id: 'p1', name: 'Player', gold: 0 });
  const c = createCounty({
    id: 'b', name: 'B', population: 1000, taxRate: 50, ownerId: 'p1', castle: CastleType.StoneCastle,
  });
  const gold = collectTaxes(c, realm); // 25 * (1 + 0.55) = 38.75
  assertClose(gold, 38.75, 0.001, 'castle wealth bonus applied');
});
