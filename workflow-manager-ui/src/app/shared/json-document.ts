import { Component, effect, input, output, signal } from '@angular/core';

/**
 * Full-document JSON editor: edits apply as soon as the text parses; parse errors show line and column.
 * Tab indents, so keyboard users need a way out: Shift+Tab leaves backwards, and Escape then Tab leaves forwards.
 */
@Component({
  selector: 'app-json-document',
  template: `
    <div class="json-doc">
      <textarea
        spellcheck="false"
        aria-label="Configuration JSON"
        aria-describedby="json-doc-status json-doc-keys"
        [class.invalid]="error()"
        [value]="text()"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKeydown($event)"
        (blur)="tabLeaves.set(false)"
      ></textarea>
      <div class="json-doc-status">
        <span id="json-doc-status" aria-live="polite">
          @if (error()) {
            <span class="error-text"><span aria-hidden="true">✖ </span>{{ error() }} — the visual editor keeps the last valid version</span>
          } @else {
            <span class="muted">Valid JSON · changes apply immediately</span>
          }
        </span>
        <span class="muted json-doc-keys" id="json-doc-keys">
          {{ tabLeaves() ? 'Press Tab to leave the editor' : 'Tab indents · Esc then Tab leaves the editor' }}
        </span>
      </div>
    </div>
  `,
})
export class JsonDocument {
  readonly value = input<unknown>();
  readonly valueChange = output<unknown>();

  protected readonly text = signal('');
  protected readonly error = signal<string | null>(null);
  /** Set by Escape: the next Tab moves focus on instead of indenting. */
  protected readonly tabLeaves = signal(false);
  private lastEmitted: unknown = Symbol('none');

  constructor() {
    effect(() => {
      const value = this.value();
      if (value !== this.lastEmitted) {
        this.text.set(JSON.stringify(value, null, 2));
        this.error.set(null);
      }
    });
  }

  protected onInput(text: string): void {
    this.text.set(text);
    try {
      const parsed = JSON.parse(text);
      this.error.set(null);
      this.lastEmitted = parsed;
      this.valueChange.emit(parsed);
    } catch (e) {
      this.error.set(describeParseError(text, e as Error));
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.tabLeaves.set(true);
      return;
    }
    const leave = this.tabLeaves();
    this.tabLeaves.set(false);
    if (event.key === 'Tab' && !event.shiftKey && !leave) {
      event.preventDefault();
      const area = event.target as HTMLTextAreaElement;
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
      this.onInput(area.value);
    }
  }
}

function describeParseError(text: string, error: Error): string {
  const match = /position (\d+)/.exec(error.message);
  if (!match) {
    return error.message;
  }
  const position = Number(match[1]);
  const before = text.slice(0, position).split('\n');
  return `${error.message.replace(/ in JSON at position \d+.*$/, '')} at line ${before.length}, column ${before[before.length - 1].length + 1}`;
}
