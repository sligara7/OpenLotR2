/*
 * DOM control panel (HUD).
 *
 * Mirrors the Lords II control panel: a header, End Turn, a control panel for
 * the currently-selected county (tax, rations, labour split, diet), a status
 * line, and a scrollable county list used to select. Every element carries a
 * data-testid so Playwright can drive it.
 */

import { RationLevel } from '../../game/types/enums.ts';
import type { County } from '../../game/types/county.ts';
import type { GameState } from '../../game/types/realm.ts';

export interface HudCallbacks {
  onEndTurn: () => void;
  onSelect: (countyId: string) => void;
  /** All act on the currently-selected county. */
  onTax: (delta: number) => void;
  onRation: (delta: number) => void;
  onIndustry: (delta: number) => void;
  onDiet: (delta: number) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  testId?: string,
  css?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (testId) node.setAttribute('data-testid', testId);
  if (css) node.style.cssText = css;
  return node;
}

export class Hud {
  private root: HTMLDivElement;
  private header: HTMLDivElement;
  private status: HTMLDivElement;
  private counties: HTMLDivElement;

  // Selected-county panel value displays.
  private panel: HTMLDivElement;
  private selName: HTMLDivElement;
  private selDetail: HTMLDivElement;
  private selTax: HTMLSpanElement;
  private selRation: HTMLSpanElement;
  private selInd: HTMLSpanElement;
  private selDiet: HTMLSpanElement;

  constructor(private readonly cb: HudCallbacks) {
    this.root = el('div', 'hud',
      'position:fixed;top:0;right:0;width:380px;max-height:100vh;overflow:auto;' +
      'background:rgba(20,16,10,0.94);color:#e8dcc0;font:13px/1.5 monospace;' +
      'padding:12px;box-sizing:border-box;z-index:10;');

    this.header = el('div', 'hud-header', 'font-size:15px;font-weight:bold;margin-bottom:8px;');

    const endTurn = el('button', 'end-turn', 'width:100%;padding:8px;margin-bottom:10px;cursor:pointer;');
    endTurn.textContent = 'End Turn ▶';
    endTurn.onclick = () => this.cb.onEndTurn();

    this.panel = el('div', 'county-panel', 'border:1px solid #4a3c28;padding:8px;margin-bottom:8px;');
    this.selName = el('div', 'sel-name', 'font-weight:bold;');
    this.selDetail = el('div', 'sel-detail', 'color:#c8b890;margin-bottom:6px;');
    this.selTax = el('span', 'sel-tax');
    this.selRation = el('span', 'sel-ration');
    this.selInd = el('span', 'sel-ind');
    this.selDiet = el('span', 'sel-diet');
    this.panel.append(
      this.selName,
      this.selDetail,
      this.controlRow('Tax', 'sel-tax', this.selTax, () => this.cb.onTax(-5), () => this.cb.onTax(5)),
      this.controlRow('Ration', 'sel-ration', this.selRation, () => this.cb.onRation(-1), () => this.cb.onRation(1)),
      this.controlRow('Industry', 'sel-ind', this.selInd, () => this.cb.onIndustry(-0.1), () => this.cb.onIndustry(0.1)),
      this.controlRow('Grain⇄Beef', 'sel-diet', this.selDiet, () => this.cb.onDiet(-0.1), () => this.cb.onDiet(0.1)),
    );
    this.showSelected(null);

    this.status = el('div', 'status', 'min-height:1.5em;color:#c8b890;margin-bottom:8px;');
    this.counties = el('div', 'counties');

    this.root.append(this.header, endTurn, this.panel, this.status, this.counties);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.root);
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  /** Render the selected-county control panel (or a prompt when none). */
  showSelected(county: County | null): void {
    if (!county) {
      this.selName.textContent = 'No county selected';
      this.selDetail.textContent = 'Click a county on the map.';
      this.selTax.textContent = this.selRation.textContent = '—';
      this.selInd.textContent = this.selDiet.textContent = '—';
      return;
    }
    this.selName.textContent = `${county.name} [${county.ownerId ?? 'unowned'}]`;
    this.selDetail.textContent =
      `pop ${county.population} · happy ${Math.round(county.happiness)} · ${county.healthLabel} · ` +
      `getting ${county.achievedRation}`;
    this.selTax.textContent = `${county.taxRate}%`;
    this.selRation.textContent = county.wantedRation;
    this.selInd.textContent = `${Math.round(county.labour.industryShare * 100)}%`;
    this.selDiet.textContent = `${Math.round(county.labour.grainBeefBalance * 100)}% beef`;
  }

  render(state: GameState): void {
    this.header.textContent = `Year ${state.year} · ${state.season} · turn ${state.turn}`;
    this.counties.replaceChildren();
    for (const c of Object.values(state.counties)) {
      const row = el('div', `county-${c.id}`, 'border-top:1px solid #4a3c28;padding:4px 0;cursor:pointer;');
      const info = el('div', `county-${c.id}-info`);
      info.textContent =
        `${c.name} [${c.ownerId ?? 'unowned'}] · pop ${c.population} · ` +
        `happy ${Math.round(c.happiness)} · ${c.healthLabel} · tax ${c.taxRate}%`;
      row.appendChild(info);
      row.onclick = () => this.cb.onSelect(c.id);
      this.counties.appendChild(row);
    }
  }

  private controlRow(
    label: string,
    valueTestId: string,
    valueEl: HTMLSpanElement,
    onDown: () => void,
    onUp: () => void,
  ): HTMLDivElement {
    const row = el('div', undefined, 'display:flex;align-items:center;gap:6px;margin-top:3px;');
    const name = el('span', undefined, 'width:84px;');
    name.textContent = label;
    const down = el('button', `${valueTestId}-down`, 'cursor:pointer;');
    down.textContent = '−';
    down.onclick = onDown;
    const up = el('button', `${valueTestId}-up`, 'cursor:pointer;');
    up.textContent = '+';
    up.onclick = onUp;
    valueEl.style.cssText = 'min-width:64px;text-align:center;';
    row.append(name, down, valueEl, up);
    return row;
  }
}

/** Cycle a ration level by `delta` steps (clamped to None..Triple). */
export function cycleRation(level: RationLevel, delta: number): RationLevel {
  const order: RationLevel[] = [
    RationLevel.None, RationLevel.Quarter, RationLevel.Half,
    RationLevel.Normal, RationLevel.Double, RationLevel.Triple,
  ];
  const idx = Math.max(0, Math.min(order.length - 1, order.indexOf(level) + delta));
  return order[idx];
}
