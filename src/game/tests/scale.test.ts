/*
 * A lead in land must buy a lead in force.
 *
 * ⚠️ THIS PINS THE CLASS, NOT A CONSTANT. The instance found on 2026-08-29 was
 * `MAX_ARMY_TARGET = 250` in ai/military.ts, over a target of
 * `50 + counties * 8`. But a test asserting "the cap is 900" would pass the day
 * somebody raised it and say nothing the next time a ceiling, a budget or a
 * morale floor quietly flattens the same curve. So these assert the SHAPE: a
 * realm holding much more land drives toward a much larger host.
 *
 * WHY IT MATTERS, measured rather than argued. Across 100 games at a 500-turn
 * cap, 84 of the 85 undecided games ended with exactly two survivors holding
 * 48.9 and 28.2 of Britain's 82 counties. At that state the army target is:
 *
 *     leader     50 + 49*8 = 442  ->  capped to 250
 *     runner-up  50 + 28*8 = 274  ->  capped to 250
 *
 * Both powers field the SAME army despite a 1.75x territorial advantage, so
 * being ahead converts into nothing and no war can be finished. Raising the cap
 * to 900 doubled the decision rate — 15/100 to 13/40, two-proportion p = 0.019.
 * The full analysis is dec:rca-army-cap-neutralises-scale.
 *
 * That is a CONTRIBUTING cause, not the whole one: two thirds of games still
 * did not end with the cap raised, because the victory condition itself demands
 * total elimination (dec:total-conquest-victory). Fixing what these tests pin
 * will not on its own make games end.
 */

import { test, assert, assertGreater } from '../testing/harness.ts';
import { planReinforce } from '../ai/military.ts';
import { TRAITS_BY_PERSONALITY } from '../ai/traits.ts';
import { createRealm } from '../state/realm.ts';
import { createCounty } from '../state/county.ts';
import { createArmy } from '../state/army.ts';
import { createWorld } from '../state/world.ts';
import { MIN_ARMY_SIZE } from '../constants.ts';
import { NoblePersonality } from '../types/enums.ts';

const BARON = TRAITS_BY_PERSONALITY[NoblePersonality.Baron];

/**
 * The host this realm drives toward, given `counties` rich and contented
 * counties and one under-strength army standing at home.
 *
 * Counties are deliberately populous and happy so that morale and manpower are
 * never the binding constraint — what is being measured is the AI's INTENT,
 * not what a poor county could bear.
 */
function hostSoughtWith(counties: number): number {
  const realm = createRealm({ id: 'p2', name: 'Realm', personality: NoblePersonality.Baron });
  const cs = Array.from({ length: counties }, (_, i) =>
    createCounty({ id: `c${i}`, name: `C${i}`, ownerId: 'p2', population: 4000, happiness: 100 }));
  const army = createArmy({
    id: 'host', ownerId: 'p2', col: 0, row: 0, countyId: 'c0', soldiers: MIN_ARMY_SIZE,
  });
  const w = createWorld({ realms: [realm], counties: cs, armies: [army] });

  const drafted = planReinforce(w, realm, BARON)
    .filter((c) => c.type === 'Conscript')
    .reduce((sum, c) => sum + (c.type === 'Conscript' ? c.count : 0), 0);

  return MIN_ARMY_SIZE + drafted;
}

test('scale: a realm holding twice the land drives toward a bigger host', () => {
  const small = hostSoughtWith(30);
  const big = hostSoughtWith(60);

  assertGreater(
    big,
    small,
    `60 counties should raise more than 30, but both sought ${big} and ${small}`,
  );
});

test('scale: the stalemate ratio must convert into a real military edge', () => {
  // The state 84 of 85 undecided games actually reach: 49 counties against 28.
  // A 1.75x lead in land buying less than a 1.3x lead in force is why neither
  // side can finish the other.
  const leader = hostSoughtWith(49);
  const runnerUp = hostSoughtWith(28);

  assertGreater(
    leader / runnerUp,
    1.3,
    `a 1.75x lead in land bought only ${(leader / runnerUp).toFixed(2)}x in force `
      + `(${leader} against ${runnerUp}) — being ahead converts into nothing`,
  );
});

test('scale: the curve keeps climbing across the range a real game covers', () => {
  // Britain is 82 counties. A realm can hold anything from a corner to nearly
  // all of it, and the host should grow across that whole span rather than
  // flattening partway — flattening is what makes the second half of a game
  // unwinnable however well the first half went.
  const steps = [10, 25, 40, 55, 70].map(hostSoughtWith);

  for (let i = 1; i < steps.length; i += 1) {
    assert(
      steps[i] > steps[i - 1],
      `the host stopped growing between the ${[10, 25, 40, 55, 70][i - 1]}- and `
        + `${[10, 25, 40, 55, 70][i]}-county realms (${steps[i - 1]} then ${steps[i]}); `
        + `full curve: ${steps.join(', ')}`,
    );
  }
});
