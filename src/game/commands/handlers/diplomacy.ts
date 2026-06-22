/*
 * Diplomacy commands (Manual Part-7 "Messages"): the peaceful half of
 * realm-to-realm relations. Gifts, compliments and insults move opinion;
 * alliance offers create a pending proposal the recipient answers; breaking an
 * alliance is the honourable farewell. The aggressive half (attacking an ally,
 * the doublecross) lives with combat, funnelled through registerHostility.
 *
 * Every handler validates against the authoritative state and is a no-op on
 * rejection, like the rest of the command protocol.
 */

import { DIPLOMACY } from '../../constants.ts';
import {
  addProposal,
  adjustOpinion,
  areAllied,
  areEnemies,
  breakAlliance,
  formAlliance,
  opinionOf,
  takeProposal,
} from '../../systems/diplomacy.ts';
import { ok, err } from '../types.ts';
import type {
  SendGift,
  SendCompliment,
  SendInsult,
  OfferAlliance,
  RespondToAlliance,
  BreakAlliance,
  CommandContext,
  CommandResult,
} from '../types.ts';
import type { GameState, Realm } from '../../types/realm.ts';

/** Resolve a living realm that the actor may address (not itself, not gone). */
function targetRealm(state: GameState, actorId: string, targetId: string): { realm?: Realm; error?: string } {
  if (targetId === actorId) return { error: 'Cannot send a message to yourself' };
  const realm = state.realms[targetId];
  if (!realm) return { error: `Unknown realm: ${targetId}` };
  if (realm.eliminated) return { error: 'That realm is no longer in the game' };
  return { realm };
}

export function sendGift(state: GameState, cmd: SendGift, ctx: CommandContext): CommandResult {
  const { realm: target, error } = targetRealm(state, ctx.actorRealmId, cmd.toRealmId);
  if (error || !target) return err(error!);
  const gold = Math.floor(cmd.gold);
  if (!(gold > 0)) return err('A gift must be a positive amount of gold');
  const giver = state.realms[ctx.actorRealmId];
  if (!giver) return err(`Unknown realm: ${ctx.actorRealmId}`);
  if (giver.treasury.gold < gold) return err('Not enough gold for that gift');

  giver.treasury.gold -= gold;
  target.treasury.gold += gold;
  const gain = Math.min(DIPLOMACY.giftOpinionCap, gold * DIPLOMACY.giftOpinionPerGold);
  const opinion = adjustOpinion(state, target.id, giver.id, gain);
  return ok(undefined, { opinion });
}

export function sendCompliment(state: GameState, cmd: SendCompliment, ctx: CommandContext): CommandResult {
  const { realm: target, error } = targetRealm(state, ctx.actorRealmId, cmd.toRealmId);
  if (error || !target) return err(error!);
  // Diminishing returns: kind words buy less the warmer the relationship is.
  const current = opinionOf(state, target.id, ctx.actorRealmId);
  const headroom = Math.max(0, 1 - Math.max(0, current) / DIPLOMACY.opinionMax);
  const gain = DIPLOMACY.complimentGain * headroom;
  const opinion = adjustOpinion(state, target.id, ctx.actorRealmId, gain);
  return ok(undefined, { opinion });
}

export function sendInsult(state: GameState, cmd: SendInsult, ctx: CommandContext): CommandResult {
  const { realm: target, error } = targetRealm(state, ctx.actorRealmId, cmd.toRealmId);
  if (error || !target) return err(error!);
  const opinion = adjustOpinion(state, target.id, ctx.actorRealmId, -DIPLOMACY.insultPenalty);
  return ok(undefined, { opinion, enemy: areEnemies(state, target.id, ctx.actorRealmId) });
}

export function offerAlliance(state: GameState, cmd: OfferAlliance, ctx: CommandContext): CommandResult {
  const { realm: target, error } = targetRealm(state, ctx.actorRealmId, cmd.toRealmId);
  if (error || !target) return err(error!);
  if (areAllied(state, ctx.actorRealmId, target.id)) return err('You are already allied');
  if (areEnemies(state, ctx.actorRealmId, target.id)) return err('A sworn enemy will never ally with you');

  const proposal = {
    id: `prop-${ctx.actorRealmId}-${target.id}-${state.turn}`,
    fromRealmId: ctx.actorRealmId,
    toRealmId: target.id,
    kind: 'alliance' as const,
    turn: state.turn,
  };
  addProposal(state, proposal);
  return ok(undefined, { proposalId: proposal.id });
}

export function respondToAlliance(state: GameState, cmd: RespondToAlliance, ctx: CommandContext): CommandResult {
  const proposal = state.diplomacy?.proposals.find((p) => p.id === cmd.proposalId);
  if (!proposal) return err(`Unknown proposal: ${cmd.proposalId}`);
  if (proposal.toRealmId !== ctx.actorRealmId) return err('That offer was not made to you');

  takeProposal(state, proposal.id);
  if (cmd.accept) {
    if (areEnemies(state, proposal.fromRealmId, proposal.toRealmId)) {
      return err('You cannot ally with a sworn enemy');
    }
    formAlliance(state, proposal.fromRealmId, proposal.toRealmId);
  }
  return ok(undefined, { accepted: !!cmd.accept });
}

export function breakAllianceCmd(state: GameState, cmd: BreakAlliance, ctx: CommandContext): CommandResult {
  const { realm: target, error } = targetRealm(state, ctx.actorRealmId, cmd.withRealmId);
  if (error || !target) return err(error!);
  if (!breakAlliance(state, ctx.actorRealmId, target.id)) return err('You have no alliance to break');
  // An honourable farewell costs only the former ally's regard — not the world's.
  adjustOpinion(state, target.id, ctx.actorRealmId, -DIPLOMACY.breakOpinionHit);
  return ok();
}
