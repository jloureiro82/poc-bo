import { Component, ElementRef, OnDestroy, afterNextRender, effect, output, signal, viewChild } from '@angular/core';

const LEVELS = [0.25, 0.33, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2];

/**
 * Scrollable, zoomable, drag-to-pan frame for a diagram. Reports the width available to the content (in unzoomed
 * pixels) so layouts can wrap to it.
 */
@Component({
  selector: 'app-diagram-viewport',
  host: {
    '(document:pointermove)': 'onPan($event)',
    '(document:pointerup)': 'endPan()',
  },
  template: `
    <div #vp class="viewport" [class.panning]="panning()" (pointerdown)="startPan($event)" (wheel)="onWheel($event)">
      <div #content class="viewport-content" [style.zoom]="zoom()">
        <ng-content />
      </div>
    </div>
    <div class="zoom-bar" (pointerdown)="$event.stopPropagation()">
      <button type="button" title="Zoom out (Ctrl + wheel)" aria-label="Zoom out" [disabled]="zoom() <= levels[0]" (click)="step(-1)">−</button>
      <button type="button" class="pct" title="Reset to 100%" (click)="zoom.set(1)">{{ percent() }}%</button>
      <button type="button" title="Zoom in (Ctrl + wheel)" aria-label="Zoom in" [disabled]="zoom() >= levels[levels.length - 1]" (click)="step(1)">+</button>
      <button type="button" title="Fit the whole diagram" (click)="fit()">Fit</button>
    </div>
  `,
})
export class DiagramViewport implements OnDestroy {
  readonly availableWidth = output<number>();

  protected readonly zoom = signal(1);
  protected readonly panning = signal(false);
  protected readonly levels = LEVELS;

  private readonly vp = viewChild.required<ElementRef<HTMLElement>>('vp');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private observer?: ResizeObserver;
  private pan: { x: number; y: number; left: number; top: number } | null = null;

  constructor() {
    afterNextRender(() => {
      this.observer = new ResizeObserver(() => this.emitWidth());
      this.observer.observe(this.vp().nativeElement);
    });
    effect(() => {
      this.zoom();
      this.emitWidth();
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  protected percent(): number {
    return Math.round(this.zoom() * 100);
  }

  protected step(direction: 1 | -1): void {
    const current = this.zoom();
    const next = direction > 0 ? LEVELS.find(l => l > current + 0.001) : [...LEVELS].reverse().find(l => l < current - 0.001);
    if (next) {
      this.zoom.set(next);
    }
  }

  /**
   * Largest zoom (up to 100%) at which the whole diagram is visible. Tries the levels from 100% down, because a
   * layout that wraps to the available width changes shape with the zoom, so it cannot be computed up front. Then
   * grows from that level to the exact zoom that fills the frame, and keeps it only if the diagram still fits.
   */
  protected async fit(): Promise<void> {
    const vp = this.vp().nativeElement;
    const fits = () => {
      const { width, height } = this.contentSize();
      return width <= vp.clientWidth + 1 && height <= vp.clientHeight + 1;
    };
    for (const level of LEVELS.filter(l => l <= 1).reverse()) {
      this.zoom.set(level);
      await nextFrames(2);
      if (fits()) {
        break;
      }
    }
    const level = this.zoom();
    const { width, height } = this.contentSize();
    const exact = Math.min(1, Math.floor(level * Math.min(vp.clientWidth / width, vp.clientHeight / height) * 100) / 100);
    if (exact > level + 0.005) {
      this.zoom.set(exact);
      await nextFrames(2);
      if (!fits()) {
        this.zoom.set(level);
      }
    }
    vp.scrollTo({ left: 0, top: 0 });
  }

  /**
   * On-screen size the diagram needs. Width runs between the diagram's own edges (plus the wrapper's padding): the
   * wrapper is stretched to the frame and a workflow is centred in it, so its right edge alone includes the centring.
   * Height runs from the top of the wrapper, so top margins (room for the diagram's tool bar) count.
   */
  private contentSize(): { width: number; height: number } {
    const content = this.content().nativeElement;
    const host = content.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(content).paddingLeft) * this.zoom();
    let left = Infinity;
    let right = 0;
    let bottom = 0;
    for (const child of Array.from(content.children)) {
      const r = child.getBoundingClientRect();
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    return right ? { width: right - left + 2 * pad, height: bottom - host.top + pad } : { width: 0, height: 0 };
  }

  protected onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.step(event.deltaY < 0 ? 1 : -1);
    }
  }

  protected startPan(event: PointerEvent): void {
    const target = event.target as Element;
    // Only pan from the background, so clicks on nodes keep selecting them.
    if (event.button !== 0 || target.closest('button, input, textarea, select, .activity, .step, .step-head, .task-node')) {
      return;
    }
    const vp = this.vp().nativeElement;
    this.pan = { x: event.clientX, y: event.clientY, left: vp.scrollLeft, top: vp.scrollTop };
    this.panning.set(true);
  }

  protected onPan(event: PointerEvent): void {
    if (!this.pan) {
      return;
    }
    const vp = this.vp().nativeElement;
    vp.scrollLeft = this.pan.left - (event.clientX - this.pan.x);
    vp.scrollTop = this.pan.top - (event.clientY - this.pan.y);
  }

  protected endPan(): void {
    this.pan = null;
    this.panning.set(false);
  }

  private emitWidth(): void {
    const vp = this.vp?.()?.nativeElement;
    if (vp?.clientWidth) {
      this.availableWidth.emit(Math.floor(vp.clientWidth / this.zoom()));
    }
  }
}

function nextFrames(count: number): Promise<void> {
  return new Promise(resolve => {
    const tick = (left: number) => (left ? requestAnimationFrame(() => tick(left - 1)) : resolve());
    tick(count);
  });
}
