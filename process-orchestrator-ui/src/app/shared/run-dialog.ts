import { JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError } from '../core/config-api.service';
import { diffOrchestrators } from '../core/diff';
import { ExecutionsApiService } from '../core/executions-api.service';
import { isObject } from '../core/json-path';
import { OrchestratorConfig } from '../core/model';
import { RunInput, loadRunInput, requestContextSkeleton, saveRunInput, workflowLabelsOf } from '../core/run-input';
import { focusableIn, trapTab } from './dialog-focus';

interface RunOutcome {
  /** The new flow, when the service named it or it could be found. */
  orchestrationId: string | null;
  /** `ok`: the flow completed; `running`: it waits (e.g. for a manual activity); `failed`: the start failed. */
  status: 'ok' | 'running' | 'failed';
  text: string;
  body: unknown;
}

/**
 * Starts a flow of the active version of an orchestrator (`POST /api/v1/orchestrator/execution/workflow/start`) with
 * a `requestContext` typed here, then links to the execution. The service runs its active version, not the editor's
 * document, so the dialog says when the two differ.
 */
@Component({
  selector: 'app-run-dialog',
  imports: [JsonPipe],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <div class="backdrop" (pointerdown)="pressedBackdrop = $event.target === $event.currentTarget"
         (click)="pressedBackdrop && $event.target === $event.currentTarget && close()">
      <div #dialog class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="run-title">
        <h2 id="run-title">Start “{{ name() }}”</h2>

        @if (loading()) {
          <p class="muted small">Reading the active version…</p>
        } @else if (activeVersion() === null) {
          <p class="banner error">
            “{{ name() }}” has no active version, so the service cannot start it. Publish it as active first.
          </p>
        } @else {
          <p class="muted small">
            The service starts version {{ activeVersion() }}, the active one. Its workflows read the request context as
            <code>{{ exampleRef }}</code>.
          </p>
          @if (draftChanges(); as n) {
            <p class="banner warning-banner small">
              The editor's document differs from version {{ activeVersion() }} ({{ n }} change{{ n > 1 ? 's' : '' }}).
              Publish it first to run your changes.
            </p>
          }
          <div class="grid2">
            <label class="field">
              <span>Owner</span>
              <input [value]="owner()" (input)="owner.set($any($event.target).value)" placeholder="optional" />
            </label>
            <label class="field">
              <span>Channel</span>
              <input [value]="channel()" (input)="channel.set($any($event.target).value)" placeholder="optional" />
            </label>
          </div>
          <label class="field">
            <span>Request context (JSON object)</span>
            <textarea class="run-input" spellcheck="false" rows="10" [value]="text()" [attr.aria-invalid]="!!parseError() || null"
                      (input)="text.set($any($event.target).value)"></textarea>
            @if (parseError(); as e) {
              <small class="error-text">{{ e }}</small>
            } @else {
              <small class="muted">Started with the keys its workflows read. The last input sent from here is remembered per flow.</small>
            }
          </label>
          <div class="actions left">
            <button type="button" class="link" (click)="text.set(skeletonText())">Reset to the keys the workflows read</button>
          </div>
        }

        @if (outcome(); as o) {
          <div class="run-outcome">
            <p>
              <span class="pill run" [attr.data-run]="o.status">{{ o.status === 'ok' ? 'completed' : o.status === 'running' ? 'waiting' : 'failed' }}</span>
              {{ o.text }}
              @if (o.orchestrationId) { <code class="muted small">{{ o.orchestrationId }}</code> }
            </p>
            <details>
              <summary>Response</summary>
              <pre>{{ o.body | json }}</pre>
            </details>
          </div>
        }

        @if (failure().length) {
          <div class="banner error">@for (line of failure(); track $index) { <div>{{ line }}</div> }</div>
        }

        <div class="actions">
          <button class="ghost" (click)="close()">{{ outcome() ? 'Close' : 'Cancel' }}</button>
          @if (outcome(); as o) {
            <button class="primary" (click)="openExecution(o.orchestrationId)">{{ o.orchestrationId ? 'Open the execution' : 'Open executions' }}</button>
          }
          <button [class.primary]="!outcome()" [disabled]="!canRun()" (click)="run()">
            {{ running() ? 'Starting…' : outcome() ? 'Start another' : 'Start' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class RunDialog implements OnInit, OnDestroy {
  private readonly configs = inject(ConfigApiService);
  private readonly executions = inject(ExecutionsApiService);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly opener = document.activeElement as HTMLElement | null;
  protected pressedBackdrop = false;

  /** The orchestrator's label (the flow name). */
  readonly name = input.required<string>();
  /** The editor's document, to warn when it differs from the active version. */
  readonly draft = input<OrchestratorConfig | null>(null);
  /** An input to start from (e.g. that of an earlier flow); else the last one sent, else the keys the workflows read. */
  readonly initialInput = input<RunInput | null>(null);
  readonly closed = output<void>();

  protected readonly exampleRef = "${workflow['requestContext']['key']}";
  protected readonly loading = signal(true);
  protected readonly activeVersion = signal<number | null>(null);
  private readonly activeBody = signal<OrchestratorConfig | null>(null);
  private readonly skeleton = signal<Record<string, unknown>>({});
  protected readonly owner = signal('');
  protected readonly channel = signal('');
  protected readonly text = signal('{}');
  protected readonly running = signal(false);
  protected readonly outcome = signal<RunOutcome | null>(null);
  protected readonly failure = signal<string[]>([]);

  protected readonly parseError = computed(() => {
    try {
      return isObject(JSON.parse(this.text())) ? null : 'The request context must be a JSON object: { … }';
    } catch (e) {
      return (e as Error).message;
    }
  });

  protected readonly draftChanges = computed(() => {
    const draft = this.draft();
    const body = this.activeBody();
    if (!draft || !body) {
      return 0;
    }
    const d = diffOrchestrators(body, draft);
    return d.fields.length + d.nodes.length;
  });

  constructor() {
    afterNextRender(() => focusableIn(this.dialog().nativeElement)[0]?.focus());
  }

  async ngOnInit(): Promise<void> {
    try {
      const active = await firstValueFrom(this.configs.active('orchestrator', this.name()));
      const version = active?.details.version;
      this.activeVersion.set(active ? (typeof version === 'number' ? version : 0) : null);
      this.activeBody.set((active?.body as OrchestratorConfig) ?? null);
      // What the flow's workflows read; a workflow that cannot be read is left out.
      const labels = workflowLabelsOf(active?.body ?? this.draft());
      const bodies = await Promise.all(
        labels.map(l => firstValueFrom(this.configs.active('workflow', l)).then(w => w?.body ?? null, () => null)),
      );
      this.skeleton.set(requestContextSkeleton(bodies.filter(Boolean)));
    } catch (e) {
      this.failure.set(['Could not read the active version: ' + describeHttpError(e).join(' ')]);
    } finally {
      this.loading.set(false);
    }
    const start = this.initialInput() ?? loadRunInput(this.name());
    this.owner.set(start?.owner ?? '');
    this.channel.set(start?.channel ?? '');
    this.text.set(start ? JSON.stringify(start.requestContext, null, 2) : this.skeletonText());
    // the textarea appears only now
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>('textarea')?.focus());
  }

  ngOnDestroy(): void {
    if (this.opener?.isConnected) {
      this.opener.focus();
    }
  }

  protected skeletonText(): string {
    return JSON.stringify(this.skeleton(), null, 2);
  }

  protected canRun(): boolean {
    return !this.loading() && !this.running() && this.activeVersion() !== null && !this.parseError();
  }

  protected async run(): Promise<void> {
    if (!this.canRun()) {
      return;
    }
    const input: RunInput = {
      ...(this.owner().trim() ? { owner: this.owner().trim() } : {}),
      ...(this.channel().trim() ? { channel: this.channel().trim() } : {}),
      requestContext: JSON.parse(this.text()) as Record<string, unknown>,
    };
    saveRunInput(this.name(), input);
    this.running.set(true);
    this.failure.set([]);
    this.outcome.set(null);
    // The flow's start date is set by the service's clock; allow for some skew when looking it up.
    const since = new Date(Date.now() - 60_000).toISOString();
    try {
      const response = await firstValueFrom(this.executions.start({ orchestrationFlow: this.name(), ...input }));
      const complete = response.flowDefinitionAPI?.complete === true;
      this.outcome.set({
        orchestrationId: response.orchestrationId ?? null,
        status: complete ? 'ok' : 'running',
        text: complete ? 'The flow ran to its end.' : 'Started. The flow waits for its next activity to be requested.',
        body: response,
      });
    } catch (e) {
      // An activity that fails answers 422 without naming the flow, which the service did create: look it up.
      if (e instanceof HttpErrorResponse && e.status === 422) {
        const latest = await firstValueFrom(this.executions.latest(this.name(), 1, since)).catch(() => []);
        this.outcome.set({
          orchestrationId: latest[0]?.orchestratorId ?? null,
          status: 'failed',
          // the problem's detail names the activity that failed
          text: isObject(e.error) && typeof e.error['detail'] === 'string' ? e.error['detail'] : describeHttpError(e).join(' '),
          body: e.error,
        });
      } else {
        this.failure.set(describeHttpError(e));
      }
    } finally {
      this.running.set(false);
    }
  }

  protected openExecution(orchestrationId: string | null): void {
    this.closed.emit();
    void this.router.navigate(orchestrationId ? ['/executions', orchestrationId] : ['/executions']);
  }

  protected close(): void {
    if (!this.running()) {
      this.closed.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.run();
    } else {
      trapTab(event, this.dialog().nativeElement);
    }
  }
}
