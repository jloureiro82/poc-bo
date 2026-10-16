import { Component, inject, input, signal } from '@angular/core';
import { PanelSide, PanelSizesService } from '../core/panel-sizes.service';

/**
 * Drag handle on the edge between a side panel and the canvas. Drag to resize, double-click to reset; the arrow keys
 * resize too when it has focus.
 */
@Component({
  selector: 'app-resize-handle',
  host: {
    class: 'resize-handle',
    '[class.left]': "side() === 'left'",
    '[class.right]': "side() === 'right'",
    '[class.dragging]': 'dragging()',
    role: 'separator',
    tabindex: '0',
    '[attr.aria-orientation]': "'vertical'",
    '[attr.aria-label]': "side() === 'left' ? 'Resize the outline panel' : 'Resize the inspector panel'",
    '[attr.aria-valuenow]': 'sizes[side()]()',
    '[title]': "'Drag to resize · double-click to reset'",
    '(pointerdown)': 'start($event)',
    '(dblclick)': 'sizes.reset(side())',
    '(keydown.arrowleft)': 'nudge(-16)',
    '(keydown.arrowright)': 'nudge(16)',
    '(document:pointermove)': 'move($event)',
    '(document:pointerup)': 'end()',
  },
  template: '',
})
export class ResizeHandle {
  protected readonly sizes = inject(PanelSizesService);

  readonly side = input.required<PanelSide>();

  protected readonly dragging = signal(false);
  private origin: { x: number; width: number } | null = null;

  protected start(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.origin = { x: event.clientX, width: this.sizes[this.side()]() };
    this.dragging.set(true);
    document.body.classList.add('resizing');
  }

  protected move(event: PointerEvent): void {
    if (!this.origin) {
      return;
    }
    const dx = event.clientX - this.origin.x;
    // The left panel grows when dragging right; the right panel grows when dragging left.
    this.sizes.set(this.side(), this.origin.width + (this.side() === 'left' ? dx : -dx));
  }

  protected end(): void {
    if (this.origin) {
      this.origin = null;
      this.dragging.set(false);
      document.body.classList.remove('resizing');
    }
  }

  protected nudge(dx: number): void {
    this.sizes.set(this.side(), this.sizes[this.side()]() + (this.side() === 'left' ? dx : -dx));
  }
}
