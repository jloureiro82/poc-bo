import { Injectable, signal } from '@angular/core';

export type PanelSide = 'left' | 'right';

const KEY = 'wm-ui.panels';
export const PANEL_DEFAULTS: Record<PanelSide, number> = { left: 250, right: 340 };
const MIN = 180;
const MAX = 760;

/** Widths of the editors' side panels (outline, inspector), shared by both editors and remembered per browser. */
@Injectable({ providedIn: 'root' })
export class PanelSizesService {
  readonly left = signal(load('left'));
  readonly right = signal(load('right'));

  set(side: PanelSide, width: number): void {
    const clamped = Math.round(Math.min(MAX, Math.max(MIN, width)));
    this[side].set(clamped);
    try {
      localStorage.setItem(KEY, JSON.stringify({ left: this.left(), right: this.right() }));
    } catch {
      // storage unavailable: widths last for this session only
    }
  }

  reset(side: PanelSide): void {
    this.set(side, PANEL_DEFAULTS[side]);
  }
}

function load(side: PanelSide): number {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')[side];
    if (typeof saved === 'number') {
      return Math.min(MAX, Math.max(MIN, saved));
    }
  } catch {
    // ignore unreadable storage
  }
  return PANEL_DEFAULTS[side];
}
