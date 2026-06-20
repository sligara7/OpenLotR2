/*
 * DOM control panel (HUD).
 *
 * Sections:
 *   - header + End Turn
 *   - YOUR REALM overview: every owned county in one place with inline tax /
 *     ration / labour / diet controls, plus BULK controls that apply to all
 *     owned counties at once (so you don't re-click each county every turn).
 *   - selected-county panel: inspect/control any single county (incl. enemy).
 *   - status line + a full county list (selector).
 *
 * Every control carries a data-testid so Playwright can drive it.
 */

import { RationLevel, UNIT_TYPES } from '../../game/types/enums.ts';
import type { UnitType } from '../../game/types/enums.ts';
import type { County } from '../../game/types/county.ts';
import type { GameState } from '../../game/types/realm.ts';
import type { Army } from '../../game/types/army.ts';
import { composition, armoryLine, armySpeed, FORGEABLE } from './units.ts';

export type ControlKind = 'tax' | 'ration' | 'industry' | 'diet';

/** Step applied per +/- click, by control kind. */
const STEP: Record<ControlKind, number> = { tax: 5, ration: 1, industry: 0.1, diet: 0.1 };

export interface HudCallbacks {
  onEndTurn: () => void;
  onSelect: (countyId: string) => void;
  /** Adjust one county. */
  onCommand: (countyId: string, kind: ControlKind, delta: number) => void;
  /** Adjust every owned county at once. */
  onBulk: (kind: ControlKind, delta: number) => void;
  /** Besiege the garrisoned castle the selected army occupies. */
  onSiege: () => void;
  /** Disband the selected army. */
  onDisband: () => void;
  /** Set a county blacksmith's product (null = idle). */
  onBlacksmith: (countyId: string, product: UnitType | null) => void;
  /** Muster a batch of `unit` from a county. */
  onMuster: (countyId: string, unit: UnitType) => void;
  /** Hire a mercenary band of `unit` at a county. */
  onHire: (countyId: string, unit: UnitType) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, testId?: string, css?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (testId) node.setAttribute('data-testid', testId);
  if (css) node.style.cssText = css;
  return node;
}

export class Hud {
  private root: HTMLDivElement;
  private header: HTMLDivElement;
  private banner!: HTMLDivElement;
  private endTurnBtn!: HTMLButtonElement;
  private status: HTMLDivElement;
  private realmRows: HTMLDivElement;
  private counties: HTMLDivElement;

  private panel: HTMLDivElement;
  private selName: HTMLDivElement;
  private selDetail: HTMLDivElement;
  private selected: County | null = null;
  private selTax!: HTMLSpanElement;
  private selRation!: HTMLSpanElement;
  private selInd!: HTMLSpanElement;
  private selDiet!: HTMLSpanElement;

  /** Military: armory readout, the army panel, and per-county forge/muster. */
  private meId = 'p1';
  private armory!: HTMLDivElement;
  private armyPanel!: HTMLDivElement;
  private armyName!: HTMLDivElement;
  private armyDetail!: HTMLDivElement;
  private siegeBtn!: HTMLButtonElement;
  private disbandBtn!: HTMLButtonElement;
  private treasury!: HTMLDivElement;
  private milRow!: HTMLDivElement;
  private forgeSel!: HTMLSelectElement;
  private musterSel!: HTMLSelectElement;

  constructor(private readonly cb: HudCallbacks) {
    this.root = el('div', 'hud',
      'position:fixed;top:0;right:0;width:400px;max-height:100vh;overflow:auto;' +
      'background:rgba(20,16,10,0.94);color:#e8dcc0;font:12px/1.45 monospace;' +
      'padding:12px;box-sizing:border-box;z-index:10;');

    this.header = el('div', 'hud-header', 'font-size:15px;font-weight:bold;margin-bottom:8px;');
    this.banner = el('div', 'game-over',
      'display:none;padding:10px;margin-bottom:10px;text-align:center;font-size:15px;font-weight:bold;border-radius:3px;');
    this.endTurnBtn = el('button', 'end-turn', 'width:100%;padding:8px;margin-bottom:10px;cursor:pointer;');
    this.endTurnBtn.textContent = 'End Turn ▶';
    this.endTurnBtn.onclick = () => this.cb.onEndTurn();
    const endTurn = this.endTurnBtn;

    // --- Your Realm overview --------------------------------------------
    const realm = el('div', 'realm', 'border:1px solid #6a5a3a;padding:8px;margin-bottom:8px;');
    const realmTitle = el('div', undefined, 'font-weight:bold;margin-bottom:4px;');
    realmTitle.textContent = 'Your Realm';
    this.treasury = el('div', 'treasury', 'color:#d8c89a;');
    this.armory = el('div', 'armory', 'color:#d8c89a;margin-bottom:4px;');
    realm.append(realmTitle, this.treasury, this.armory, this.bulkRow(), (this.realmRows = el('div', 'realm-rows')));

    // --- Selected county -------------------------------------------------
    this.panel = el('div', 'county-panel', 'border:1px solid #4a3c28;padding:8px;margin-bottom:8px;');
    this.selName = el('div', 'sel-name', 'font-weight:bold;');
    this.selDetail = el('div', 'sel-detail', 'color:#c8b890;margin-bottom:6px;');
    const tax = this.control('sel-tax', () => this.selected?.id ?? null, 'tax');
    const ration = this.control('sel-ration', () => this.selected?.id ?? null, 'ration');
    const ind = this.control('sel-ind', () => this.selected?.id ?? null, 'industry');
    const diet = this.control('sel-diet', () => this.selected?.id ?? null, 'diet');
    this.selTax = tax.value; this.selRation = ration.value; this.selInd = ind.value; this.selDiet = diet.value;
    this.milRow = this.buildMilControls();
    this.panel.append(
      this.selName, this.selDetail,
      this.labelled('Tax', tax.group), this.labelled('Ration', ration.group),
      this.labelled('Industry', ind.group), this.labelled('Grain⇄Beef', diet.group),
      this.milRow,
    );
    this.showSelected(null);

    // --- Selected army ---------------------------------------------------
    this.armyPanel = el('div', 'army-panel', 'border:1px solid #5a3c28;padding:8px;margin-bottom:8px;');
    this.armyName = el('div', 'army-name', 'font-weight:bold;');
    this.armyDetail = el('div', 'army-detail', 'color:#c8b890;margin:4px 0;');
    this.siegeBtn = el('button', 'army-siege', 'cursor:pointer;padding:4px 8px;margin-right:6px;');
    this.siegeBtn.textContent = 'Lay Siege';
    this.siegeBtn.onclick = () => this.cb.onSiege();
    this.disbandBtn = el('button', 'army-disband', 'cursor:pointer;padding:4px 8px;');
    this.disbandBtn.textContent = 'Disband';
    this.disbandBtn.onclick = () => this.cb.onDisband();
    this.armyPanel.append(this.armyName, this.armyDetail, this.siegeBtn, this.disbandBtn);
    this.showArmy(null, null, 'p1');

    this.status = el('div', 'status', 'min-height:1.4em;color:#c8b890;margin:6px 0;');
    this.counties = el('div', 'counties');

    this.root.append(this.header, this.banner, endTurn, realm, this.panel, this.armyPanel, this.status, this.counties);
  }

  /** Show the end-game banner (and lock End Turn) once the game is decided. */
  showOutcome(outcome: GameState['outcome'], meId: string, realmName: (id: string) => string): void {
    if (!outcome) {
      this.banner.style.display = 'none';
      this.endTurnBtn.disabled = false;
      return;
    }
    const won = outcome.winnerId === meId;
    const winner = outcome.winnerId ? realmName(outcome.winnerId) : null;
    let text: string;
    if (outcome.reason === 'extinction') text = 'The realm lies in ruins — no victor.';
    else if (won) text = outcome.reason === 'conquest' ? 'VICTORY — you rule the land by conquest!' : 'VICTORY — you are the last lord standing!';
    else text = `DEFEAT — ${winner ?? 'a rival'} prevails.`;
    this.banner.textContent = text;
    this.banner.style.background = won ? '#2e5a2a' : '#5a2a26';
    this.banner.style.color = '#f4ecd6';
    this.banner.style.display = 'block';
    this.endTurnBtn.disabled = true;
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.root);
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  showSelected(county: County | null): void {
    this.selected = county;
    if (!county) {
      this.selName.textContent = 'No county selected';
      this.selDetail.textContent = 'Click a county on the map.';
      this.selTax.textContent = this.selRation.textContent = this.selInd.textContent = this.selDiet.textContent = '—';
      this.milRow.style.display = 'none';
      return;
    }
    this.selName.textContent = `${county.name} [${county.ownerId ?? 'unowned'}]`;
    const garrison = county.castle.garrison > 0 ? ` · garrison ${county.castle.garrison}` : '';
    const forging = county.blacksmithProduct ? ` · forging ${county.blacksmithProduct}` : '';
    this.selDetail.textContent =
      `pop ${county.population} · happy ${Math.round(county.happiness)} · ${county.healthLabel} · ` +
      `getting ${county.achievedRation}${garrison}${forging}`;
    this.selTax.textContent = `${county.taxRate}%`;
    this.selRation.textContent = county.wantedRation;
    this.selInd.textContent = `${Math.round(county.labour.industryShare * 100)}%`;
    this.selDiet.textContent = `${Math.round(county.labour.grainBeefBalance * 100)}% beef`;

    // Forge/muster controls only make sense on your own counties.
    const mine = county.ownerId === this.meId;
    this.milRow.style.display = mine ? 'flex' : 'none';
    if (mine) this.forgeSel.value = county.blacksmithProduct ?? '';
  }

  /** Show the currently selected army's strength, composition, and siege option. */
  showArmy(army: Army | null, state: GameState | null, meId: string): void {
    if (!army) {
      this.armyName.textContent = 'No army selected';
      this.armyDetail.textContent = 'Click an army on the map.';
      this.siegeBtn.style.display = 'none';
      this.disbandBtn.style.display = 'none';
      return;
    }
    const county = army.countyId && state ? state.counties[army.countyId] ?? null : null;
    const where = county ? county.name : army.countyId ?? 'open country';
    const mine = army.ownerId === meId;
    this.armyName.textContent = `Army [${army.ownerId}]${army.mercenary ? ' ⚔ mercenary' : ''} — ${army.soldiers} men`;
    this.armyDetail.textContent = `${composition(army)} · at ${where} · move ${army.movement}/${armySpeed(army)}`;
    const canSiege = mine && !!county && county.ownerId !== meId && county.castle.garrison > 0;
    this.siegeBtn.style.display = canSiege ? 'inline-block' : 'none';
    // Disband only your own army, and only when it stands in your own county.
    this.disbandBtn.style.display = mine && !!county && county.ownerId === meId ? 'inline-block' : 'none';
  }

  /** Blacksmith (forge) + conscription (muster) controls for an owned county. */
  private buildMilControls(): HTMLDivElement {
    const row = el('div', 'mil-controls', 'border-top:1px solid #4a3c28;margin-top:6px;padding-top:6px;flex-direction:column;gap:4px;display:none;');

    const forge = el('div', undefined, 'display:flex;align-items:center;gap:6px;');
    const fLabel = el('span'); fLabel.textContent = 'Forge:';
    this.forgeSel = el('select', 'forge-select', 'background:#1a140c;color:#e8dcc0;border:1px solid #5a4a2a;');
    const idle = document.createElement('option'); idle.value = ''; idle.textContent = '— idle —';
    this.forgeSel.appendChild(idle);
    for (const u of FORGEABLE) { const o = document.createElement('option'); o.value = u; o.textContent = u; this.forgeSel.appendChild(o); }
    this.forgeSel.onchange = () => {
      const id = this.selected?.id;
      if (id) this.cb.onBlacksmith(id, (this.forgeSel.value || null) as UnitType | null);
    };
    forge.append(fLabel, this.forgeSel);

    const muster = el('div', undefined, 'display:flex;align-items:center;gap:6px;');
    const mLabel = el('span'); mLabel.textContent = 'Muster:';
    this.musterSel = el('select', 'muster-select', 'background:#1a140c;color:#e8dcc0;border:1px solid #5a4a2a;');
    for (const u of UNIT_TYPES) { const o = document.createElement('option'); o.value = u; o.textContent = u; this.musterSel.appendChild(o); }
    const mBtn = el('button', 'muster-btn', 'cursor:pointer;padding:2px 8px;');
    mBtn.textContent = 'Muster 50';
    mBtn.onclick = () => { const id = this.selected?.id; if (id) this.cb.onMuster(id, this.musterSel.value as UnitType); };
    const hBtn = el('button', 'hire-btn', 'cursor:pointer;padding:2px 8px;');
    hBtn.textContent = 'Hire 50';
    hBtn.title = 'Hire a self-armed mercenary band (gold only)';
    hBtn.onclick = () => { const id = this.selected?.id; if (id) this.cb.onHire(id, this.musterSel.value as UnitType); };
    muster.append(mLabel, this.musterSel, mBtn, hBtn);

    row.append(forge, muster);
    return row;
  }

  /** @param meId the human player's realm id (owned counties are listed). */
  render(state: GameState, meId: string): void {
    this.meId = meId;
    this.header.textContent = `Year ${state.year} · ${state.season} · turn ${state.turn}`;
    const t = state.realms[meId]?.treasury;
    this.treasury.textContent = t
      ? `Treasury: ${Math.round(t.gold)} gold · ${Math.round(t.wood)} wood · ${Math.round(t.stone)} stone · ${Math.round(t.iron)} iron`
      : 'Treasury: —';
    this.armory.textContent = `Armory: ${armoryLine(state.realms[meId]?.treasury.weapons ?? {})}`;

    // Realm overview: one editable row per owned county.
    const owned = Object.values(state.counties).filter((c) => c.ownerId === meId);
    this.realmRows.replaceChildren();
    if (owned.length === 0) {
      this.realmRows.textContent = 'No counties yet.';
    }
    for (const c of owned) {
      const row = el('div', `realm-${c.id}`, 'border-top:1px solid #4a3c28;padding:4px 0;');
      const name = el('div', undefined, 'font-weight:bold;');
      name.textContent = `${c.name} · pop ${c.population} · happy ${Math.round(c.happiness)} · ${c.achievedRation}`;
      const controls = el('div', undefined, 'display:flex;flex-wrap:wrap;gap:8px;margin-top:2px;');
      const tax = this.control(`realm-${c.id}-tax`, () => c.id, 'tax');
      const ration = this.control(`realm-${c.id}-ration`, () => c.id, 'ration');
      const ind = this.control(`realm-${c.id}-ind`, () => c.id, 'industry');
      const diet = this.control(`realm-${c.id}-diet`, () => c.id, 'diet');
      tax.value.textContent = `${c.taxRate}%`;
      ration.value.textContent = c.wantedRation;
      ind.value.textContent = `${Math.round(c.labour.industryShare * 100)}%`;
      diet.value.textContent = `${Math.round(c.labour.grainBeefBalance * 100)}%b`;
      controls.append(
        this.labelled('Tax', tax.group), this.labelled('Food', ration.group),
        this.labelled('Lab', ind.group), this.labelled('Diet', diet.group),
      );
      row.append(name, controls);
      this.realmRows.appendChild(row);
    }

    // Full county list (selector / at-a-glance).
    this.counties.replaceChildren();
    for (const c of Object.values(state.counties)) {
      const row = el('div', `county-${c.id}`, 'border-top:1px solid #332a1c;padding:3px 0;cursor:pointer;');
      const info = el('div', `county-${c.id}-info`);
      info.textContent =
        `${c.name} [${c.ownerId ?? 'unowned'}] · pop ${c.population} · happy ${Math.round(c.happiness)} · ${c.healthLabel} · tax ${c.taxRate}%`;
      row.appendChild(info);
      row.onclick = () => this.cb.onSelect(c.id);
      this.counties.appendChild(row);
    }
  }

  // --- builders ---------------------------------------------------------

  /** A [−][value][+] control bound to a county (resolved at click time). */
  private control(valueTestId: string, target: () => string | null, kind: ControlKind) {
    const group = el('span', undefined, 'display:inline-flex;align-items:center;gap:2px;');
    const down = el('button', `${valueTestId}-down`, 'cursor:pointer;padding:0 5px;');
    down.textContent = '−';
    const value = el('span', valueTestId, 'min-width:46px;text-align:center;');
    const up = el('button', `${valueTestId}-up`, 'cursor:pointer;padding:0 5px;');
    up.textContent = '+';
    down.onclick = () => { const id = target(); if (id) this.cb.onCommand(id, kind, -STEP[kind]); };
    up.onclick = () => { const id = target(); if (id) this.cb.onCommand(id, kind, STEP[kind]); };
    group.append(down, value, up);
    return { group, value };
  }

  private labelled(label: string, control: HTMLElement): HTMLElement {
    const wrap = el('span', undefined, 'display:inline-flex;align-items:center;gap:4px;');
    const name = el('span');
    name.textContent = label;
    wrap.append(name, control);
    return wrap;
  }

  /** Bulk controls that apply a step to every owned county. */
  private bulkRow(): HTMLElement {
    const row = el('div', 'realm-bulk', 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;color:#d8c89a;');
    const all = el('span'); all.textContent = 'All:';
    row.appendChild(all);
    const kinds: [string, ControlKind][] = [['Tax', 'tax'], ['Food', 'ration'], ['Lab', 'industry'], ['Diet', 'diet']];
    for (const [label, kind] of kinds) {
      const group = el('span', undefined, 'display:inline-flex;align-items:center;gap:2px;');
      const name = el('span'); name.textContent = label;
      const down = el('button', `realm-bulk-${kind}-down`, 'cursor:pointer;padding:0 5px;'); down.textContent = '−';
      const up = el('button', `realm-bulk-${kind}-up`, 'cursor:pointer;padding:0 5px;'); up.textContent = '+';
      down.onclick = () => this.cb.onBulk(kind, -STEP[kind]);
      up.onclick = () => this.cb.onBulk(kind, STEP[kind]);
      group.append(name, down, up);
      row.appendChild(group);
    }
    return row;
  }
}

/** Cycle a ration level by `delta` steps (clamped to None..Triple). */
export function cycleRation(level: RationLevel, delta: number): RationLevel {
  const order: RationLevel[] = [
    RationLevel.None, RationLevel.Quarter, RationLevel.Half,
    RationLevel.Normal, RationLevel.Double, RationLevel.Triple,
  ];
  const idx = Math.max(0, Math.min(order.length - 1, order.indexOf(level) + Math.sign(delta) * Math.abs(Math.round(delta))));
  return order[idx];
}
