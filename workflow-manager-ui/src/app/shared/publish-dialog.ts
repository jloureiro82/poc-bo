import { Component, ElementRef, OnDestroy, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError } from '../core/config-api.service';
import { WorkflowDiff, diffWorkflows, preview, unstoredKeys } from '../core/diff';
import { focusableIn, trapTab } from './dialog-focus';
import { ConfigurationDetails, WorkflowDefinition } from '../core/model';

export interface Published {
  name: string;
  version: number;
}

/**
 * Collects the `configurationDetails` (version metadata) and POSTs `{ workflowConfiguration, configurationDetails }`
 * to the create endpoint. Suggests the version after the running one; the service lists no other versions, so a
 * number that is already taken only shows when the service refuses it.
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
        <h2 id="publish-title">Publish workflow “{{ name() }}”</h2>

        @if (errorCount() > 0) {
          <p class="banner error">
            The workflow has {{ errorCount() }} error{{ errorCount() > 1 ? 's' : '' }}. Fix them before publishing.
          </p>
        } @else {
          @if (running() !== null) {
            <p class="muted small">The service runs version {{ running() }} of “{{ name() }}”.</p>
          } @else if (!loadingVersions()) {
            <p class="muted small">The service runs no version of “{{ name() }}” yet, so everything in it is new.</p>
          }
          @if (changes(); as d) {
            <section class="changes" aria-labelledby="changes-title">
              <h3 id="changes-title">Changes from version {{ running() }}</h3>
              @if (d.identical) {
                <p class="banner warning-banner small">
                  This is the same definition as version {{ running() }}. Publishing stores it again under a new number.
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
                  @for (t of d.tasks; track t.path + t.kind) {
                    <li [attr.data-change]="t.kind">
                      <span class="change-kind">{{ t.kind }}</span> task <strong>{{ t.label }}</strong>
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
          @if (dropped().length) {
            <p class="muted small">
              The service does not store these top-level fields, so the published version will not have them:
              @for (k of dropped(); track k) { <code>{{ k }}</code>&nbsp; }
            </p>
          }
          <div class="grid2">
            <label class="field">
              <span>Version *</span>
              <input type="number" [value]="details().version ?? ''" (input)="set('version', num($event))" />
              @if (notNewer()) {
                <small class="error-text">Not above the running version {{ running() }}, so the service would keep running that one</small>
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
              <span>Activation date *</span>
              <input type="datetime-local" [value]="localDate()" (input)="setDate(str($event))" />
            </label>
          </div>
          <label class="field">
            <span>Description</span>
            <input [value]="details().description ?? ''" (input)="set('description', str($event))" />
            <small class="muted">Stored as the description of this version and of the workflow.</small>
          </label>
          <label class="check">
            <input type="checkbox" [checked]="details().active" (change)="set('active', $any($event.target).checked)" />
            Active
          </label>
          <p class="muted small">
            The service runs the highest active version whose activation date has passed. A version cannot be
            activated later, so an inactive one is stored but never runs.
          </p>
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

  readonly name = input.required<string>();
  readonly body = input.required<WorkflowDefinition>();
  readonly errorCount = input(0);
  readonly closed = output<void>();
  readonly published = output<Published>();

  protected readonly details = signal<ConfigurationDetails>({
    version: 1,
    schemaVersion: 1,
    active: true,
    deprecated: false,
    user: '',
    description: '',
    activationDate: new Date().toISOString(),
  });
  /** The version the service runs now, or `null`. */
  protected readonly running = signal<number | null>(null);
  private readonly runningBody = signal<WorkflowDefinition | null>(null);
  /** What publishing changes compared with the running version (`null` when there is none). */
  protected readonly changes = computed(() => {
    const before = this.runningBody();
    return before ? diffWorkflows(before, this.body()) : null;
  });
  protected readonly dropped = computed(() => unstoredKeys(this.body()));
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
    // The service stores the version's description as the workflow's, so start from what the editor holds.
    const description = this.body().description;
    if (typeof description === 'string') {
      this.set('description', description);
    }
    try {
      const running = await firstValueFrom(this.api.running(this.name()));
      const version = running?.details.version;
      if (typeof version === 'number') {
        this.running.set(version);
        this.set('version', version + 1);
      }
      this.runningBody.set(running?.body ?? null);
    } catch (e) {
      this.failure.set(['Could not read the running version: ' + describeHttpError(e).join(' ')]);
    } finally {
      this.loadingVersions.set(false);
    }
  }

  protected summary(d: WorkflowDiff): string {
    const count = (kind: string) => d.tasks.filter(t => t.kind === kind).length;
    const parts = [
      d.fields.length ? `${d.fields.length} workflow field${d.fields.length > 1 ? 's' : ''} changed` : '',
      ...(['added', 'removed', 'changed', 'moved'] as const).map(k => (count(k) ? `${count(k)} task${count(k) > 1 ? 's' : ''} ${k}` : '')),
    ].filter(Boolean);
    return parts.join(' · ');
  }

  protected notNewer(): boolean {
    const running = this.running();
    const version = this.details().version;
    return running !== null && typeof version === 'number' && version <= running;
  }

  protected canSubmit(): boolean {
    const d = this.details();
    // the activation date is a required column of the stored version
    return this.errorCount() === 0 && !this.submitting() && Number.isInteger(d.version) && Number.isInteger(d.schemaVersion) && !!d.activationDate;
  }

  protected async submit(): Promise<void> {
    this.submitting.set(true);
    this.failure.set([]);
    try {
      await firstValueFrom(this.api.create({ configurationDetails: this.details(), workflowConfiguration: this.body() }));
      this.published.emit({ name: this.name(), version: this.details().version as number });
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
