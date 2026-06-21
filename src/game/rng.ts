/*
 * Seeded, deterministic RNG.
 *
 * The simulation must never call Math.random(): determinism is required for
 * reproducible turns, save/replay, and tests (and Math.random is unavailable
 * in some harnesses). This is a small mulberry32 generator — fast and good
 * enough for game randomness.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** The generator's current internal state — pass it back to createRng() to
   *  resume the exact sequence (used by save/load). */
  state(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    state: () => a >>> 0,
  };
}
