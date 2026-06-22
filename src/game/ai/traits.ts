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
  /** 0..1 taste for diplomacy — seeking alliances, gifts, appeasing the strong
   *  (Manual Part-7: the Countess is a master of it, the Knight "no statesman"). */
  diplomacy: number;
}

// Target taxes stay at/below TAX_TOLERANCE (30): above it, taxes erode happiness
// every season, and with no conquest to fund yet a ruler that over-taxes simply
// starves itself of people. Personality varies the rate BELOW that line (the
// Knight squeezes hardest); harsher taxation pairs with conquest in a later pass.
/** Flavour drawn from Manual Part-7 "The Players". */
export const TRAITS_BY_PERSONALITY: Record<NoblePersonality, AiTraits> = {
  // Daring, works his peasantry "to the point of cruelty", lives for battle —
  // "no statesman", so he shuns the negotiating chambers.
  [NoblePersonality.Knight]:   { targetTax: 30, happinessFloor: 30, aggression: 0.9, buildAmbition: 0.3, diplomacy: 0.1 },
  // Ruthless yet a master of diplomacy — allies readily (and betrays when it pays).
  [NoblePersonality.Countess]: { targetTax: 27, happinessFloor: 40, aggression: 0.6, buildAmbition: 0.5, diplomacy: 0.95 },
  // Hoards wealth behind a clerical fortress; bold on top, craven when cornered —
  // buys off the strong with gifts and pious words.
  [NoblePersonality.Bishop]:   { targetTax: 28, happinessFloor: 45, aggression: 0.2, buildAmbition: 0.8, diplomacy: 0.6 },
  // The cold, calculating elder statesman — allies only when it serves the plan.
  [NoblePersonality.Baron]:    { targetTax: 24, happinessFloor: 40, aggression: 0.7, buildAmbition: 0.7, diplomacy: 0.5 },
};

/** Fallback for a personality-less AI realm (shouldn't arise, but stays safe). */
export const DEFAULT_TRAITS: AiTraits = {
  targetTax: 25, happinessFloor: 35, aggression: 0.5, buildAmbition: 0.4, diplomacy: 0.4,
};
