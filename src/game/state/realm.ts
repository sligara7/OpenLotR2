/* Realm (noble) construction & treasury helpers. */

import type { NoblePersonality } from '../types/enums.ts';
import type { Realm, Treasury } from '../types/realm.ts';

export interface RealmInit {
  id: string;
  name: string;
  isHuman?: boolean;
  personality?: NoblePersonality | null;
  gold?: number;
  wood?: number;
  stone?: number;
  iron?: number;
}

export function createRealm(init: RealmInit): Realm {
  return {
    id: init.id,
    name: init.name,
    isHuman: init.isHuman ?? false,
    personality: init.personality ?? null,
    treasury: {
      gold: init.gold ?? 200,
      wood: init.wood ?? 0,
      stone: init.stone ?? 0,
      iron: init.iron ?? 0,
      weapons: {},
    },
    eliminated: false,
  };
}

/** Add (or subtract, with negative values) to a treasury in place. */
export function adjustTreasury(t: Treasury, delta: Partial<Treasury>): void {
  if (delta.gold) t.gold += delta.gold;
  if (delta.wood) t.wood += delta.wood;
  if (delta.stone) t.stone += delta.stone;
  if (delta.iron) t.iron += delta.iron;
}
