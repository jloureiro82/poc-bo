import { Directive, ElementRef, afterEveryRender, inject, input } from '@angular/core';

/**
 * Makes a textarea as tall as its content (from its `rows` up to `maxRows`, then it scrolls). With `singleLine`,
 * Enter does not insert a line break: long values still wrap so they are fully visible, but stay one logical line
 * (URLs, expressions, names).
 */
@Directive({
  selector: 'textarea[autoGrow]',
  host: {
    class: 'auto-grow',
    '(input)': 'resize()',
    '(keydown.enter)': 'onEnter($event)',
  },
})
export class AutoGrow {
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;

  readonly maxRows = input(16);
  readonly singleLine = input(false, { transform: (v: boolean | string) => v !== false && v !== 'false' });

  private lastValue: string | null = null;
  private lastWidth = 0;

  constructor() {
    // Values arrive through [value] bindings too (undo, JSON tab, selection changes), not only typing.
    afterEveryRender(() => {
      if (this.el.value !== this.lastValue || this.el.clientWidth !== this.lastWidth) {
        this.resize();
      }
    });
  }

  protected onEnter(event: Event): void {
    if (this.singleLine()) {
      event.preventDefault();
    }
  }

  resize(): void {
    const el = this.el;
    this.lastValue = el.value;
    this.lastWidth = el.clientWidth;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.45;
    const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const max = line * this.maxRows() + chrome;
    el.style.height = 'auto';
    const needed = el.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    el.style.height = `${Math.min(needed, max)}px`;
    el.style.overflowY = needed > max ? 'auto' : 'hidden';
  }
}
