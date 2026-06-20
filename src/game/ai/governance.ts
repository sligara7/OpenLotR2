/*
 * AI economic governance — one ruler's per-county economy, expressed as the same
 * Commands a human would send (so it is bound by the same ownership + validation
 * rules; the AI cannot cheat). Pure planning: reads state, returns intents.
 */

import { CastleType, FieldStatus, RationLevel } from '../types/enums.ts';
import {
  ALE_COST,
  BEEF_PORTIONS_PER_COW,
  CASTLE_SPEC,
  GRAIN_SACKS_PER_PORTION,
} from '../constants.ts';
import { countiesOfRealm } from '../state/world.ts';
import type { GameState, Realm } from '../types/realm.ts';
import type { County } from '../types/county.ts';
import type { Command } from '../commands/types.ts';
import type { AiTraits } from './traits.ts';

/** Castle designs in upgrade order, simplest → grandest. */
const CASTLE_LADDER: CastleType[] = [
  CastleType.None,
  CastleType.WoodenPalisade,
  CastleType.MotteAndBailey,
  CastleType.NormanKeep,
  CastleType.StoneCastle,
  CastleType.RoyalCastle,
];

/** Rough seasons of food the county has banked (grain + slaughterable beef). */
function seasonsOfFood(c: County): number {
  if (c.population <= 0) return Infinity;
  const portions = c.food.grainSacks / GRAIN_SACKS_PER_PORTION + c.food.cows * BEEF_PORTIONS_PER_COW;
  return portions / c.population;
}

/** All economic commands this ruler wants to issue across the counties it owns. */
export function planGovernance(state: GameState, realm: Realm, traits: AiTraits): Command[] {
  const cmds: Command[] = [];

  for (const county of countiesOfRealm(state, realm.id)) {
    const food = seasonsOfFood(county);

    // Tax: chase the target rate, but ease off when the county is unhappy. (The
    // dispatcher forbids raising taxes at zero happiness; we don't try.)
    const desiredTax = county.happiness < traits.happinessFloor
      ? Math.max(0, traits.targetTax - 15)
      : traits.targetTax;
    const cannotRaise = county.happiness <= 0 && desiredTax > county.taxRate;
    if (Math.abs(desiredTax - county.taxRate) > 1 && !cannotRaise) {
      cmds.push({ type: 'SetTaxRate', countyId: county.id, rate: desiredTax });
    }

    // Ration: conserve when food is short; feast to lift mood when rich but glum.
    let ration: RationLevel = RationLevel.Normal;
    if (food < 2) ration = RationLevel.Half;
    else if (county.happiness < traits.happinessFloor && food > 6) ration = RationLevel.Double;
    if (ration !== county.wantedRation) {
      cmds.push({ type: 'SetRation', countyId: county.id, level: ration });
    }

    // Labour: farm hard when food is tight, otherwise free hands for industry.
    const industryShare = food < 3 ? 0.25 : 0.45;
    if (Math.abs(industryShare - county.labour.industryShare) > 0.05) {
      cmds.push({ type: 'SetLabourPolicy', countyId: county.id, industryShare });
    }

    // Put idle land to work — grain first (it both feeds people and stores).
    county.fields.forEach((f, i) => {
      if (f.status === FieldStatus.Fallow) {
        cmds.push({ type: 'AssignField', countyId: county.id, fieldIndex: i, use: FieldStatus.Grain });
      }
    });

    // Buy ale to quell unrest when it's affordable and not already in effect.
    if (county.happiness < traits.happinessFloor && county.aleSeasons === 0 &&
        realm.treasury.gold >= ALE_COST) {
      cmds.push({ type: 'BuyAle', countyId: county.id });
    }

    // Ambitious rulers upgrade a settled county's castle once the materials are
    // largely in hand (the build draws them down over the seasons that follow).
    const castleIdle = county.castle.type === CastleType.None || county.castle.buildProgress >= 1;
    if (traits.buildAmbition > 0.6 && county.happiness >= traits.happinessFloor && castleIdle) {
      const next = CASTLE_LADDER[CASTLE_LADDER.indexOf(county.castle.type) + 1];
      if (next) {
        const spec = CASTLE_SPEC[next];
        if (realm.treasury.wood >= spec.wood * 0.3 && realm.treasury.stone >= spec.stone * 0.3) {
          cmds.push({ type: 'BuildCastle', countyId: county.id, design: next });
        }
      }
    }
  }

  return cmds;
}
