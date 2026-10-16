import { Component, effect, input, output, signal } from '@angular/core';
import { AutoGrow } from './auto-grow';

/**
 * Edits one JSON value (typically a `staticVariables` / parameters object) as text. Emits only parseable values;
 * an empty box emits `undefined` (the key is removed).
 */
@Component({
  selector: 'app-json-field',
  imports: [AutoGrow],
  template: `
    <label class="field">
      <span>{{ label() }}</span>
      <textarea
        autoGrow
        [maxRows]="24"
        [rows]="rows()"
        spellcheck="false"
        [class.invalid]="error()"
        [value]="text()"
        [placeholder]="placeholder()"
        (input)="onInput($any($event.target).value)"
        (blur)="reformat()"
      ></textarea>
      @if (error()) {
        <small class="error-text">{{ error() }}</small>
      } @else if (hint()) {
        <small class="muted">{{ hint() }}</small>
      }
    </label>
  `,
})
export class JsonField {
  readonly label = input.required<string>();
  readonly value = input<unknown>();
  readonly rows = input(4);
  readonly hint = input<string>('');
  readonly placeholder = input('{ }');
  /** Require a JSON object (rather than any JSON value). */
  readonly objectOnly = input(true);
  readonly valueChange = output<unknown>();

  protected readonly text = signal('');
  protected readonly error = signal<string | null>(null);
  private lastEmitted: unknown = Symbol('none');

  constructor() {
    effect(() => {
      const value = this.value();
      if (value !== this.lastEmitted) {
        this.text.set(value === undefined ? '' : JSON.stringify(value, null, 2));
        this.error.set(null);
      }
    });
  }

  protected onInput(text: string): void {
    this.text.set(text);
    if (!text.trim()) {
      this.error.set(null);
      this.emit(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (this.objectOnly() && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
        this.error.set('Must be a JSON object, e.g. { "name": "value" }');
        return;
      }
      this.error.set(null);
      this.emit(parsed);
    } catch (e) {
      this.error.set(`Invalid JSON: ${(e as Error).message}`);
    }
  }

  protected reformat(): void {
    if (!this.error() && this.lastEmitted !== undefined && typeof this.lastEmitted !== 'symbol') {
      this.text.set(JSON.stringify(this.lastEmitted, null, 2));
    }
  }

  private emit(value: unknown): void {
    this.lastEmitted = value;
    this.valueChange.emit(value);
  }
}
