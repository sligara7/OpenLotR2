/*
 * AI turn planner & driver.
 *
 * planRealmTurn() composes one AI ruler's intents (governance + maneuver) as a
 * list of Commands — pure, read-only, easy to test. takeAiTurns() then APPLIES
 * every AI realm's plan through the public dispatcher, exactly as a remote
 * client would: each command is validated and ownership-checked, so the AI is
 * bound by the same rules as the human. It deliberately does NOT end the turn —
 * the caller ticks the world once every realm (human + AI) has acted.
 */

import { dispatch } from '../commands/dispatch.ts';
import { planGovernance } from './governance.ts';
import { planMilitary } from './military.ts';
import { TRAITS_BY_PERSONALITY, DEFAULT_TRAITS } from './traits.ts';
import type { GameState, Realm } from '../types/realm.ts';
import type { Command } from '../commands/types.ts';

export interface AiRealmLog {
  realmId: string;
  /** Commands the ruler issued this turn. */
  commands: Command[];
  /** Any commands the dispatcher rejected (a planning bug if non-empty). */
  rejected: { command: Command; error: string }[];
}

export interface AiTurnLog {
  realms: AiRealmLog[];
}

/** Is this realm one the AI should drive (a living, non-human ruler)? */
export function isAiRealm(realm: Realm): boolean {
  return !realm.isHuman && realm.personality !== null && !realm.eliminated;
}

/** All commands an AI ruler wants to issue this turn (governance + maneuver). */
export function planRealmTurn(state: GameState, realm: Realm): Command[] {
  const traits = realm.personality ? TRAITS_BY_PERSONALITY[realm.personality] : DEFAULT_TRAITS;
  return [...planGovernance(state, realm, traits), ...planMilitary(state, realm, traits)];
}

/**
 * Plan and apply every AI realm's turn through dispatch(). Mutates `state`.
 * Returns a per-realm log of issued (and any rejected) commands. Does not end
 * the turn — call EndTurn / advanceSeason afterwards to tick the world.
 */
export function takeAiTurns(state: GameState): AiTurnLog {
  const realms: AiRealmLog[] = [];

  for (const realm of Object.values(state.realms)) {
    if (!isAiRealm(realm)) continue;

    const commands = planRealmTurn(state, realm);
    const log: AiRealmLog = { realmId: realm.id, commands, rejected: [] };
    for (const command of commands) {
      const result = dispatch(state, command, { actorRealmId: realm.id });
      if (!result.ok) log.rejected.push({ command, error: result.error ?? 'unknown' });
    }
    realms.push(log);
  }

  return { realms };
}
