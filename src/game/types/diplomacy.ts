/*
 * Diplomacy state — the standing between realms. (Manual Part-7 "Diplomacy".)
 *
 * The manual frames relationships as a bar per opponent (red=hostile ->
 * blue=indifferent -> green=friendly), an optional ALLIANCE pact, and a
 * permanent ENEMY status once a breach is irreparable. We model that as:
 *
 *   - `opinions[A][B]`  — DIRECTIONAL: how much A likes B (-100..+100). A gift
 *                          from A raises B's opinion of A, not the reverse, so
 *                          opinion is asymmetric (matching the per-portrait bar).
 *   - `alliances`       — SYMMETRIC pacts, one entry per unordered pair.
 *   - `enemies`         — SYMMETRIC permanent breaches, one entry per pair.
 *   - `proposals`       — pending alliance offers awaiting a yes/no.
 *
 * Everything here is plain serialisable data (no Maps/Sets) so it round-trips
 * through save/load and the REST API like the rest of GameState.
 */

/** Kinds of message a realm can send another. (Manual Part-7 "Messages".) */
export const DiploMessageType = {
  Gift: 'Gift',
  Compliment: 'Compliment',
  Insult: 'Insult',
  OfferAlliance: 'OfferAlliance',
} as const;
export type DiploMessageType =
  (typeof DiploMessageType)[keyof typeof DiploMessageType];

/** A pending alliance offer from one realm to another, awaiting a response. */
export interface DiploProposal {
  id: string;
  fromRealmId: string;
  toRealmId: string;
  /** Only alliances are negotiated for now; kept open for future pact types. */
  kind: 'alliance';
  /** Turn the offer was made (offers expire after DIPLOMACY.proposalTtl turns). */
  turn: number;
}

/** A standing alliance between two realms (canonical-keyed, see relKey). */
export interface Alliance {
  /** Turn the pact was formed — for display and the warming-over-time bonus. */
  since: number;
}

/** A favour one ally asks of another. (Manual Part-7: "Ask ally for help" sends
 *  troops to a county under attack; "Ask ally to attack" points them at a
 *  target.) The asked ally's AI honours it while it stands, or ignores it. */
export interface AllyRequest {
  id: string;
  /** Realm making the request. */
  fromRealmId: string;
  /** The ally being asked. */
  toRealmId: string;
  kind: 'defend' | 'attack';
  /** The county to defend (one of `from`'s) or to attack (the target). */
  countyId: string;
  /** Turn the request was made (requests lapse after DIPLOMACY.requestTtl). */
  turn: number;
}

/** The complete diplomatic picture for a game. */
export interface DiplomacyState {
  /** opinions[from][to] = how `from` regards `to` (-100..+100, 0 = neutral). */
  opinions: Record<string, Record<string, number>>;
  /** Active alliances, keyed by relKey(a, b). */
  alliances: Record<string, Alliance>;
  /** Permanent enemies, keyed by relKey(a, b). */
  enemies: Record<string, true>;
  /** Outstanding alliance offers. */
  proposals: DiploProposal[];
  /** Outstanding ally requests (help / attack). */
  requests: AllyRequest[];
  /** Last turn `from` complimented `to`, keyed "from>to" — drives the
   *  diminishing/backfiring returns of flattery. */
  recentCompliments: Record<string, number>;
}

/** A read-friendly band for the relationship bar. (Manual: red/blue/green.) */
export const OpinionBand = {
  Hostile: 'hostile',
  Indifferent: 'indifferent',
  Friendly: 'friendly',
} as const;
export type OpinionBand = (typeof OpinionBand)[keyof typeof OpinionBand];
