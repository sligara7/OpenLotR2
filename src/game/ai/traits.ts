/*
 * AI ruler personalities → a small set of behaviour knobs.
 *
 * The manual's Part-7 "The Players" sketches four characters; here each is
 * distilled into a handful of numbers the governance/military planners read.
 * Keeping the flavour in ONE table (not scattered through the planners) means a
 * designer can re-tune a personality without touching decision logic.
 */

import { NoblePersonality } from '../types/enums.ts';

export interface AiTraits {
  /** Tax rate (0..100) the ruler aims for when the county can bear it. */
  targetTax: number;
  /** Happiness below which the ruler eases taxes, feasts the people, buys ale. */
  happinessFloor: number;
  /** 0..1 willingness to march the army into non-owned land to forage/raid. */
  aggression: number;
  /** 0..1 appetite for spending the treasury on castle upgrades. */
  buildAmbition: number;
}

/** Flavour drawn from Manual Part-7 "The Players". */
export const TRAITS_BY_PERSONALITY: Record<NoblePersonality, AiTraits> = {
  // Daring, works his peasantry "to the point of cruelty", lives for battle.
  [NoblePersonality.Knight]:   { targetTax: 35, happinessFloor: 25, aggression: 0.9, buildAmbition: 0.3 },
  // Ruthless yet a master of diplomacy — keeps her people just content enough.
  [NoblePersonality.Countess]: { targetTax: 28, happinessFloor: 40, aggression: 0.6, buildAmbition: 0.5 },
  // Hoards wealth behind a clerical fortress; bold on top, craven when cornered.
  [NoblePersonality.Bishop]:   { targetTax: 32, happinessFloor: 45, aggression: 0.2, buildAmbition: 0.8 },
  // The cold, calculating elder statesman — patient, expansionist, well-defended.
  [NoblePersonality.Baron]:    { targetTax: 25, happinessFloor: 40, aggression: 0.7, buildAmbition: 0.7 },
};

/** Fallback for a personality-less AI realm (shouldn't arise, but stays safe). */
export const DEFAULT_TRAITS: AiTraits = {
  targetTax: 25, happinessFloor: 35, aggression: 0.5, buildAmbition: 0.4,
};
