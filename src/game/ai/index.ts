/* AI ruler module — public surface (consumed via the game barrel). */

export { takeAiTurns, planRealmTurn, isAiRealm } from './planner.ts';
export type { AiTurnLog, AiRealmLog } from './planner.ts';
export { planGovernance } from './governance.ts';
export { planMilitary, planReinforce } from './military.ts';
export { TRAITS_BY_PERSONALITY, DEFAULT_TRAITS } from './traits.ts';
export type { AiTraits } from './traits.ts';
