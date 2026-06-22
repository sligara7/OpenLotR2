/*
 * Diplomacy panel (Manual Part-7). One row per rival realm showing how THEY
 * regard you (the relationship bar: red hostile / blue indifferent / green
 * friendly), alliance and sworn-enemy markers, and the message actions —
 * compliment, insult, gift, offer/break alliance. Pending alliance offers
 * addressed to you appear up top with Accept / Reject.
 *
 * Pure view: reads GameState, calls back into the controller. Diplomacy logic
 * (band thresholds, allied/enemy lookups) is imported from the core's small
 * pure helpers, the same way the map view imports pathfinding.
 */

import { opinionOf, opinionBand, areAllied, areEnemies } from '../../game/systems/diplomacy.ts';
import { OpinionBand } from '../../game/types/diplomacy.ts';
import type { GameState } from '../../game/types/realm.ts';

export interface DiplomacyCallbacks {
  onGift: (toRealmId: string, gold: number) => void;
  onCompliment: (toRealmId: string) => void;
  onInsult: (toRealmId: string) => void;
  onOffer: (toRealmId: string) => void;
  onBreak: (toRealmId: string) => void;
  onRespond: (proposalId: string, accept: boolean) => void;
  /** Ask an ally to defend your currently selected county. */
  onRequestDefend: (allyRealmId: string) => void;
  /** Ask an ally to attack your currently selected county. */
  onRequestAttack: (allyRealmId: string) => void;
}

/** Default gold in the gift amount field. */
export const GIFT_AMOUNT = 100;

const BAND_COLOUR: Record<string, string> = {
  [OpinionBand.Friendly]: '#6ab04a',
  [OpinionBand.Indifferent]: '#4a78b0',
  [OpinionBand.Hostile]: '#b04a4a',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, testId?: string, css?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (testId) node.setAttribute('data-testid', testId);
  if (css) node.style.cssText = css;
  return node;
}

function btn(testId: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', testId, 'cursor:pointer;padding:1px 6px;');
  b.textContent = label;
  b.title = title;
  b.onclick = onClick;
  return b;
}

/** A −100..+100 opinion bar tinted by its band. */
function opinionBar(value: number): HTMLElement {
  const wrap = el('div', undefined, 'flex:1;height:8px;background:#1a130a;border:1px solid #4a3c28;border-radius:2px;overflow:hidden;');
  const fill = el('div', undefined,
    `height:100%;width:${Math.round(((value + 100) / 200) * 100)}%;background:${BAND_COLOUR[opinionBand(value)]};`);
  wrap.appendChild(fill);
  return wrap;
}

/** Rebuild the whole panel into `container`. */
export function renderDiplomacy(container: HTMLElement, state: GameState, meId: string, cb: DiplomacyCallbacks): void {
  container.replaceChildren();
  const rivals = Object.values(state.realms).filter((r) => r.id !== meId && !r.eliminated);
  if (rivals.length === 0) {
    container.textContent = 'No rivals remain.';
    return;
  }

  // Pending offers addressed to me.
  const inbox = (state.diplomacy?.proposals ?? []).filter((p) => p.toRealmId === meId);
  for (const p of inbox) {
    const from = state.realms[p.fromRealmId]?.name ?? p.fromRealmId;
    const row = el('div', `diplo-offer-${p.fromRealmId}`, 'display:flex;align-items:center;gap:6px;padding:3px 0;color:#e9c87c;');
    const txt = el('span', undefined, 'flex:1;');
    txt.textContent = `${from} offers an alliance`;
    row.append(txt,
      btn(`diplo-accept-${p.fromRealmId}`, 'Accept', 'Accept the alliance', () => cb.onRespond(p.id, true)),
      btn(`diplo-reject-${p.fromRealmId}`, 'Reject', 'Decline the alliance', () => cb.onRespond(p.id, false)));
    container.appendChild(row);
  }

  for (const r of rivals) {
    const allied = areAllied(state, meId, r.id);
    const enemy = areEnemies(state, meId, r.id);
    const theirView = opinionOf(state, r.id, meId); // how they regard me drives their behaviour
    const offered = (state.diplomacy?.proposals ?? []).some((p) => p.fromRealmId === meId && p.toRealmId === r.id);

    const row = el('div', `diplo-${r.id}`, 'border-top:1px solid #332a1c;padding:4px 0;');
    const head = el('div', undefined, 'display:flex;align-items:center;gap:6px;');
    const name = el('span', undefined, 'font-weight:bold;min-width:96px;');
    const marker = allied ? ' 🤝' : enemy ? ' ☠' : '';
    name.textContent = `${r.name}${marker}`;
    head.append(name, opinionBar(theirView), el('span', `diplo-${r.id}-opinion`, 'min-width:30px;text-align:right;'));
    (head.lastChild as HTMLElement).textContent = String(Math.round(theirView));

    const actions = el('div', undefined, 'display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;');
    if (allied) {
      actions.append(
        btn(`diplo-break-${r.id}`, 'Break alliance', 'Honourably terminate the alliance', () => cb.onBreak(r.id)),
        btn(`diplo-defend-${r.id}`, 'Ask defend', 'Ask them to defend the selected county of yours', () => cb.onRequestDefend(r.id)),
        btn(`diplo-attack-${r.id}`, 'Ask attack', 'Ask them to march on the selected county', () => cb.onRequestAttack(r.id)));
    } else if (!enemy) {
      actions.appendChild(
        offered
          ? Object.assign(btn(`diplo-offer-${r.id}`, 'Offer sent', 'Awaiting their answer', () => {}), { disabled: true })
          : btn(`diplo-offer-${r.id}`, 'Offer alliance', 'Propose an alliance', () => cb.onOffer(r.id)));
    }
    // Gift: an editable amount + dispatch button.
    const giftAmt = el('input', `diplo-gift-amount-${r.id}`, 'width:48px;background:#221809;color:#f0e3c4;border:1px solid #6a5638;border-radius:3px;');
    giftAmt.type = 'number';
    giftAmt.min = '1';
    giftAmt.value = String(GIFT_AMOUNT);
    actions.append(
      btn(`diplo-compliment-${r.id}`, 'Compliment', 'Free goodwill (diminishing — and backfires if overdone)', () => cb.onCompliment(r.id)),
      giftAmt,
      btn(`diplo-gift-${r.id}`, 'Gift', 'Send the gold to win favour', () => cb.onGift(r.id, Math.max(1, Math.floor(Number(giftAmt.value) || 0)))),
      btn(`diplo-insult-${r.id}`, 'Insult', 'Vent hostility — can make a permanent enemy', () => cb.onInsult(r.id)));

    row.append(head, actions);
    container.appendChild(row);
  }
}
