/*
 * DOM control panel (HUD) rendered over the Phaser canvas.
 *
 * Deliberately plain DOM (not canvas-drawn) so it is inspectable and clickable
 * by Playwright: every meaningful element carries a data-testid. The Phaser
 * canvas handles the map/visuals; this panel handles readable state + actions.
 */

import type { GameState } from '../../game/types/realm.ts';

export interface HudCallbacks {
  onEndTurn: () => void;
  onAdjustTax: (countyId: string, delta: number) => void;
}

export class Hud {
  private root: HTMLDivElement;
  private header: HTMLDivElement;
  private counties: HTMLDivElement;
  private status: HTMLDivElement;

  constructor(private readonly cb: HudCallbacks) {
    this.root = el('div', 'hud');
    this.root.style.cssText =
      'position:fixed;top:0;right:0;width:380px;max-height:100vh;overflow:auto;' +
      'background:rgba(20,16,10,0.92);color:#e8dcc0;font:13px/1.5 monospace;' +
      'padding:12px;box-sizing:border-box;z-index:10;';

    this.header = el('div', 'hud-header');
    this.header.style.cssText = 'font-size:15px;font-weight:bold;margin-bottom:8px;';

    const endTurn = document.createElement('button');
    endTurn.textContent = 'End Turn ▶';
    endTurn.setAttribute('data-testid', 'end-turn');
    endTurn.style.cssText = 'width:100%;padding:8px;margin-bottom:10px;cursor:pointer;';
    endTurn.onclick = () => this.cb.onEndTurn();

    this.counties = el('div', 'counties');
    this.status = el('div', 'status');
    this.status.style.cssText = 'margin-top:8px;min-height:1.5em;color:#c8b890;';

    this.root.append(this.header, endTurn, this.counties, this.status);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.root);
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  render(state: GameState): void {
    this.header.textContent = `Year ${state.year} · ${state.season} · turn ${state.turn}`;
    this.counties.replaceChildren();

    for (const c of Object.values(state.counties)) {
      const row = el('div', `county-${c.id}`);
      row.style.cssText = 'border-top:1px solid #4a3c28;padding:6px 0;';

      const info = el('div', `county-${c.id}-info`);
      info.textContent =
        `${c.name} [${c.ownerId ?? 'unowned'}] · pop ${c.population} · ` +
        `happy ${Math.round(c.happiness)} · ${c.healthLabel} · tax ${c.taxRate}%`;

      const controls = document.createElement('div');
      controls.style.cssText = 'margin-top:4px;display:flex;gap:6px;';
      controls.append(
        taxButton(`county-${c.id}-tax-down`, 'Tax −5', () => this.cb.onAdjustTax(c.id, -5)),
        taxButton(`county-${c.id}-tax-up`, 'Tax +5', () => this.cb.onAdjustTax(c.id, +5)),
      );

      row.append(info, controls);
      this.counties.appendChild(row);
    }
  }
}

function el(tag: string, testId: string): HTMLDivElement {
  const node = document.createElement(tag) as HTMLDivElement;
  node.setAttribute('data-testid', testId);
  return node;
}

function taxButton(testId: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.setAttribute('data-testid', testId);
  b.style.cursor = 'pointer';
  b.onclick = onClick;
  return b;
}
