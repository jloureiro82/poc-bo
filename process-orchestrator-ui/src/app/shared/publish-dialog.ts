import { Component, ElementRef, OnDestroy, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AnyEnvelope, BODY_KEY, ConfigApiService, describeHttpError, toStored } from '../core/config-api.service';
import { ConfigDiff, diffConfigs, preview } from '../core/diff';
import { ConfigKind, ConfigurationDetails } from '../core/model';
import { focusableIn, trapTab } from './dialog-focus';

/**
 * Collects the `configurationDetails` (version metadata) and POSTs `{ <kind>Configuration, configurationDetails }`
 * to `/api/v1/<kind>/create`. Suggests the next free version number from the existing versions.
 *
 * Modal: focus starts in the dialog and Tab stays inside it; Escape or Cancel closes it and focus goes back to the
 * element that opened it (the Publish button).
 */
@Component({
  selector: 'app-publish-dialog',
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <div class="backdrop" (pointerdown)="pressedBackdrop = $event.target === $event.currentTarget"
         (click)="pressedBackdrop && $event.target === $event.currentTarget && close()">
      <div #dialog class="dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title">
        <h2 id="publish-title">Publish {{ kind() }} “{{ name() }}”</h2>

        @if (errorCount() > 0) {
          <p class="banner error">
            The configuration has {{ errorCount() }} error{{ errorCount() > 1 ? 's' : '' }}. Fix them before publishing.
          </p>
        } @else {
          @if (existing().length) {
            <p class="muted small">Existing versions: {{ existing().join(', ') }}</p>
          } @else if (!loadingVersions()) {
            <p class="muted small">No version of “{{ name() }}” exists yet, so everything in it is new.</p>
          }
          @if (changes(); as d) {
            <section class="changes" aria-labelledby="changes-title">
              <h3 id="changes-title">Changes from version {{ base()!.version }} ({{ base()!.active ? 'the active one' : 'the newest; none is active' }})</h3>
              @if (d.identical) {
                <p class="banner warning-banner small">
                  This is the same configuration as version {{ base()!.version }}. Publishing stores it again under a new number.
                </p>
              } @else {
                <p class="muted small">{{ summary(d) }}</p>
                <ul class="change-list">
                  @for (f of d.fields; track f.path) {
                    <li [attr.data-change]="f.kind">
                      <span class="change-kind">{{ f.kind }}</span> <code>{{ f.path }}</code>
                      <span class="change-values">{{ preview(f.before) }} → {{ preview(f.after) }}</span>
                    </li>
                  }
                  @for (t of d.nodes; track t.path + t.kind) {
                    <li [attr.data-change]="t.kind">
                      <span class="change-kind">{{ t.kind }}</span> {{ t.noun }} <strong>{{ t.label }}</strong>
                      <span class="muted small">
                        in {{ t.where }}@if (t.from && t.from !== t.where) {, was in {{ t.from }}}@if (t.kind === 'moved' && t.from === t.where) {, in another position}
                      </span>
                      @if (t.fields.length) {
                        <ul>
                          @for (f of t.fields; track f.path) {
                            <li><code>{{ f.path }}</code> <span class="change-values">{{ preview(f.before) }} → {{ preview(f.after) }}</span></li>
                          }
                        </ul>
                      }
                    </li>
                  }
                </ul>
              }
            </section>
          }
          <div class="grid2">
            <label class="field">
              <span>Version *</span>
              <input type="number" [value]="details().version ?? ''" (input)="set('version', num($event))" />
              @if (versionTaken()) {
                <small class="error-text">Version {{ details().version }} already exists</small>
              }
            </label>
            <label class="field">
              <span>Schema version *</span>
              <input type="number" [value]="details().schemaVersion ?? ''" (input)="set('schemaVersion', num($event))" />
            </label>
            <label class="field">
              <span>User</span>
              <input [value]="details().user ?? ''" (input)="set('user', str($event))" />
            </label>
            <label class="field">
              <span>Activation date</span>
              <input type="datetime-local" [value]="localDate()" (input)="setDate(str($event))" />
            </label>
          </div>
          <label class="field">
            <span>Description</span>
            <input [value]="details().description ?? ''" (input)="set('description', str($event))" />
          </label>
          <label class="check">
            <input type="checkbox" [checked]="details().active" (change)="set('active', $any($event.target).checked)" />
            Active (the engine runs the active version)
          </label>
        }

        @if (failure().length) {
          <div class="banner error">
            @for (line of failure(); track $index) {
              <div>{{ line }}</div>
            }
          </div>
        }

        <div class="actions">
          <button class="ghost" (click)="close()">Cancel</button>
          <button class="primary" [disabled]="!canSubmit()" (click)="submit()">
            {{ submitting() ? 'Publishing…' : 'Publish' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class PublishDialog implements OnInit, OnDestroy {
  private readonly api = inject(ConfigApiService);
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  /** Where focus goes back to when the dialog closes. */
  private readonly opener = document.activeElement as HTMLElement | null;
  /** Closing on a backdrop click needs the press to start there too, so a text selection dragged out does not close. */
  protected pressedBackdrop = false;

  readonly kind = input.required<ConfigKind>();
  readonly name = input.required<string>();
  readonly body = input.required<unknown>();
  readonly errorCount = input(0);
  readonly closed = output<void>();
  readonly published = output<AnyEnvelope>();

  protected readonly details = signal<ConfigurationDetails>({
    version: 1,
    schemaVersion: 1,
    active: true,
    deprecated: false,
    user: '',
    description: '',
    activationDate: new Date().toISOString(),
  });
  protected readonly existing = signal<number[]>([]);
  /** The version the changes are listed against: the active one, else the newest. */
  protected readonly base = signal<{ version: number; active: boolean; body: unknown } | null>(null);
  protected readonly changes = computed(() => {
    const base = this.base();
    return base ? diffConfigs(this.kind(), base.body, this.body()) : null;
  });
  protected readonly preview = preview;
  protected readonly loadingVersions = signal(true);
  protected readonly submitting = signal(false);
  protected readonly failure = signal<string[]>([]);

  constructor() {
    afterNextRender(() => (this.dialog().nativeElement.querySelector<HTMLElement>('input') ?? focusableIn(this.dialog().nativeElement)[0])?.focus());
  }

  ngOnDestroy(): void {
    if (this.opener?.isConnected) {
      this.opener.focus();
    }
  }

  protected close(): void {
    if (!this.submitting()) {
      this.closed.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else {
      trapTab(event, this.dialog().nativeElement);
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      const versions = await firstValueFrom(this.api.versions(this.kind(), this.name()));
      const stored = versions.map(v => toStored(this.kind(), v)).filter(v => typeof v.details.version === 'number');
      const active = stored.find(v => v.details.active && !v.details.deprecated);
      const newest = [...stored].sort((a, b) => (b.details.version as number) - (a.details.version as number))[0];
      const base = active ?? newest;
      this.base.set(base ? { version: base.details.version as number, active: base === active, body: base.body } : null);
      const numbers = versions
        .map(v => toStored(this.kind(), v).details.version)
        .filter((v): v is number => typeof v === 'number')
        .sort((a, b) => b - a);
      this.existing.set(numbers);
      this.set('version', numbers.length ? numbers[0] + 1 : 1);
    } catch (e) {
      this.failure.set(['Could not read existing versions: ' + describeHttpError(e).join(' ')]);
    } finally {
      this.loadingVersions.set(false);
    }
  }

  protected summary(d: ConfigDiff): string {
    const parts = d.fields.length ? [`${d.fields.length} top-level field${d.fields.length > 1 ? 's' : ''} changed`] : [];
    for (const noun of ['step', 'activity', 'task'] as const) {
      for (const kind of ['added', 'removed', 'changed', 'moved'] as const) {
        const n = d.nodes.filter(c => c.noun === noun && c.kind === kind).length;
        if (n) {
          parts.push(`${n} ${n > 1 ? (noun === 'activity' ? 'activities' : noun + 's') : noun} ${kind}`);
        }
      }
    }
    return parts.join(' · ');
  }

  protected versionTaken(): boolean {
    return this.existing().includes(this.details().version as number);
  }

  protected canSubmit(): boolean {
    const d = this.details();
    return (
      this.errorCount() === 0 &&
      !this.submitting() &&
      Number.isInteger(d.version) &&
      Number.isInteger(d.schemaVersion) &&
      !this.versionTaken()
    );
  }

  protected async submit(): Promise<void> {
    this.submitting.set(true);
    this.failure.set([]);
    const envelope = { [BODY_KEY[this.kind()]]: this.body(), configurationDetails: this.details() } as unknown as AnyEnvelope;
    try {
      const saved = await firstValueFrom(this.api.create(this.kind(), envelope));
      this.published.emit(saved);
    } catch (e) {
      this.failure.set(describeHttpError(e));
    } finally {
      this.submitting.set(false);
    }
  }

  protected set(key: keyof ConfigurationDetails, value: unknown): void {
    this.details.update(d => ({ ...d, [key]: value }));
  }

  protected localDate(): string {
    const iso = this.details().activationDate;
    if (!iso) {
      return '';
    }
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  protected setDate(local: string): void {
    this.set('activationDate', local ? new Date(local).toISOString() : undefined);
  }

  protected num(event: Event): number | undefined {
    const raw = (event.target as HTMLInputElement).value;
    return raw === '' ? undefined : Number(raw);
  }

  protected str(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
