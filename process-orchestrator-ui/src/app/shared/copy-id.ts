import { Component, OnDestroy, input, signal } from '@angular/core';

/**
 * Shows an id in monospace; a click copies it to the clipboard and says so for a moment. The click does not reach
 * the parent, so it works inside clickable table rows.
 */
@Component({
  selector: 'app-copy-id',
  template: `
    <button type="button" class="copy-id" [class.copied]="copied()" (click)="copy($event)"
            [title]="copied() ? 'Copied' : 'Click to copy'" [attr.aria-label]="'Copy ' + value()">
      <code>{{ value() }}</code><span class="copy-id-hint" aria-live="polite">{{ copied() ? '✓ copied' : '⧉' }}</span>
    </button>
  `,
})
export class CopyId implements OnDestroy {
  readonly value = input.required<string>();
  protected readonly copied = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  protected async copy(event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    if (await copyText(this.value())) {
      this.copied.set(true);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.copied.set(false), 1500);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}

/** Copies text. `navigator.clipboard` exists only on HTTPS or localhost, so plain-HTTP deployments use the old way. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall back below
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
