import { Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Makes a non-button element (a `<div>` row, an SVG `<g>`) reachable with Tab and activated with Enter or Space, by
 * dispatching the same `click` a mouse would. The element's own `(click)` handler stays the single code path.
 * `[keyActivate]="false"` turns it off (no tab stop).
 */
@Directive({
  selector: '[keyActivate]',
  host: {
    '[attr.tabindex]': 'enabled() ? 0 : null',
    '[class.key-activate]': 'enabled()',
    '(keydown)': 'onKeydown($event)',
  },
})
export class KeyActivate {
  private readonly host = inject<ElementRef<Element>>(ElementRef);

  readonly enabled = input(true, { alias: 'keyActivate', transform: (v: boolean | '') => v !== false });

  protected onKeydown(event: KeyboardEvent): void {
    // Keys pressed on a button or input inside the row belong to that control.
    if (!this.enabled() || event.target !== this.host.nativeElement || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }
    event.preventDefault();
    this.host.nativeElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
}
