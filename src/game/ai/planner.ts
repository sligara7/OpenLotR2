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
import { planMilitary, planReinforce } from './military.ts';
import { planDiplomacy } from './diplomacy.ts';
import { TRAITS_BY_PERSONALITY, DEFAULT_TRAITS } from './traits.ts';
import type { GameState, Realm } from '../types/realm.ts';
import type { Command } from '../commands/types.ts';
import type { Rng } from '../rng.ts';

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

/** All commands an AI ruler wants to issue this turn (governance + maneuver).
 *  The seeded `rng`, when supplied, drives the AI's exploration choices. */
export function planRealmTurn(state: GameState, realm: Realm, rng?: Rng): Command[] {
  const traits = realm.personality ? TRAITS_BY_PERSONALITY[realm.personality] : DEFAULT_TRAITS;
  // Order: conduct diplomacy, govern the economy, raise/forge troops, then
  // maneuver (so alliances settle before armies pick targets, and fresh
  // recruits march out the same turn).
  return [
    ...planDiplomacy(state, realm, traits),
    ...planGovernance(state, realm, traits),
    ...planReinforce(state, realm),
    ...planMilitary(state, realm, traits, rng),
  ];
}

/**
 * Plan and apply every AI realm's turn through dispatch(). Mutates `state`.
 * Returns a per-realm log of issued (and any rejected) commands. Does not end
 * the turn — call EndTurn / advanceSeason afterwards to tick the world.
 *
 * Pass the game's RNG so the AI's field battles (AttackArmy) resolve
 * deterministically; without it those commands are rejected, leaving the rest.
 */
export function takeAiTurns(state: GameState, rng?: Rng): AiTurnLog {
  const realms: AiRealmLog[] = [];

  for (const realm of Object.values(state.realms)) {
    if (!isAiRealm(realm)) continue;

    const commands = planRealmTurn(state, realm, rng);
    const log: AiRealmLog = { realmId: realm.id, commands, rejected: [] };
    for (const command of commands) {
      const result = dispatch(state, command, { actorRealmId: realm.id, rng });
      if (!result.ok) log.rejected.push({ command, error: result.error ?? 'unknown' });
    }
    realms.push(log);
  }

  return { realms };
}
