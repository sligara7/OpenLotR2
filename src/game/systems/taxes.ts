/*
 * Taxes (Manual Part-3 "Taxes", "Castles and Tax Revenues").
 *
 * Revenue scales with population and the county's tax rate, and is boosted by
 * the presence/size of a completed castle ("Castles attract wealth"). Gold
 * flows into the owning realm's shared treasury. Collected at season end,
 * before population changes — so the figure reflects the taxed population.
 */

import { CASTLE_SPEC, TAX_GOLD_PER_PERSON } from '../constants.ts';
import type { County } from '../types/county.ts';
import type { Realm } from '../types/realm.ts';

export function collectTaxes(county: County, realm: Realm | undefined): number {
  const castleBonus =
    county.castle.buildProgress >= 1 ? CASTLE_SPEC[county.castle.type].taxBonus : 0;
  const gold = county.population * (county.taxRate / 100) * TAX_GOLD_PER_PERSON * (1 + castleBonus);
  if (realm) realm.treasury.gold += gold;
  return gold;
}
