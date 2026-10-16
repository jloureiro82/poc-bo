import { JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError } from '../core/config-api.service';
import { diffWorkflows } from '../core/diff';
import { runStatusOf } from '../core/executions';
import { ExecutionsApiService } from '../core/executions-api.service';
import { isObject } from '../core/json-path';
import { WorkflowDefinition } from '../core/model';
import { inputSkeleton, loadRunInput, saveRunInput } from '../core/run-input';
import { focusableIn, trapTab } from './dialog-focus';

interface RunOutcome {
  /** HTTP status of the run request. */
  httpStatus: number;
  workflowId: string | null;
  status: string | null;
  body: unknown;
  note: string;
}

/**
 * Starts a run of the version the service runs (`POST /api/v1/execution/workflow/{name}/run`) with an input typed
 * here, then links to the execution. The service runs its published version, not the editor's document, so the
 * dialog says when the two differ.
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
        <h2 id="run-title">Run “{{ name() }}”</h2>

        @if (loading()) {
          <p class="muted small">Reading the version the service runs…</p>
        } @else if (runningVersion() === null) {
          <p class="banner error">
            The service runs no version of “{{ name() }}”, so it cannot start a run. Publish the workflow first.
          </p>
        } @else {
          <p class="muted small">
            The service runs version {{ runningVersion() }}. The run uses that version, with the input below as
            <code>workflow</code> (<code>{{ exampleRef }}</code>).
          </p>
          @if (draftChanges(); as n) {
            <p class="banner warning-banner small">
              The editor's document differs from version {{ runningVersion() }} ({{ n }} change{{ n > 1 ? 's' : '' }}).
              Publish it first to run your changes.
            </p>
          }
          <label class="field">
            <span>Input (JSON object)</span>
            <textarea class="run-input" spellcheck="false" rows="10" [value]="text()" [attr.aria-invalid]="!!parseError() || null"
                      (input)="text.set($any($event.target).value)"></textarea>
            @if (parseError(); as e) {
              <small class="error-text">{{ e }}</small>
            } @else {
              <small class="muted">Started with the keys the expressions read. The last input sent from here is remembered per workflow.</small>
            }
          </label>
          <div class="actions left">
            <button type="button" class="link" (click)="text.set(skeletonText())">Reset to the keys the workflow reads</button>
          </div>
        }

        @if (outcome(); as o) {
          <div class="run-outcome">
            <p>
              @if (o.status) {
                <span class="pill run" [attr.data-run]="runStatusOf(o.status)">{{ o.status.toLowerCase() }}</span>
              }
              <span class="muted small">HTTP {{ o.httpStatus }}</span>
              {{ o.note }}
            </p>
            @if (o.body !== null && o.body !== '') {
              <details>
                <summary>Response</summary>
                <pre>{{ o.body | json }}</pre>
              </details>
            }
          </div>
        }

        @if (failure().length) {
          <div class="banner error">@for (line of failure(); track $index) { <div>{{ line }}</div> }</div>
        }

        <div class="actions">
          <button class="ghost" (click)="close()">{{ outcome() ? 'Close' : 'Cancel' }}</button>
          @if (outcome(); as o) {
            <button class="primary" (click)="openExecution(o.workflowId)">{{ o.workflowId ? 'Open the execution' : 'Open executions' }}</button>
          }
          <button [class.primary]="!outcome()" [disabled]="!canRun()" (click)="run()">
            {{ running() ? 'Running…' : outcome() ? 'Run again' : 'Run' }}
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

  readonly name = input.required<string>();
  /** The editor's document, to warn when it differs from the running version. */
  readonly draft = input<WorkflowDefinition | null>(null);
  /** An input to start from (e.g. that of an earlier run); else the last one sent, else the keys the workflow reads. */
  readonly initialInput = input<Record<string, unknown> | null>(null);
  readonly closed = output<void>();

  protected readonly exampleRef = '${workflow.key}';
  protected readonly loading = signal(true);
  protected readonly runningVersion = signal<number | null>(null);
  private readonly runningBody = signal<WorkflowDefinition | null>(null);
  protected readonly text = signal('{}');
  protected readonly running = signal(false);
  protected readonly outcome = signal<RunOutcome | null>(null);
  protected readonly failure = signal<string[]>([]);
  protected readonly runStatusOf = runStatusOf;

  protected readonly parseError = computed(() => {
    try {
      return isObject(JSON.parse(this.text())) ? null : 'The input must be a JSON object: { … }';
    } catch (e) {
      return (e as Error).message;
    }
  });

  protected readonly draftChanges = computed(() => {
    const draft = this.draft();
    const body = this.runningBody();
    if (!draft || !body) {
      return 0;
    }
    const d = diffWorkflows(body, draft);
    return d.fields.length + d.tasks.length;
  });

  constructor() {
    afterNextRender(() => (this.dialog().nativeElement.querySelector<HTMLElement>('textarea') ?? focusableIn(this.dialog().nativeElement)[0])?.focus());
  }

  async ngOnInit(): Promise<void> {
    try {
      const running = await firstValueFrom(this.configs.running(this.name()));
      const version = running?.details.version;
      this.runningVersion.set(running ? (typeof version === 'number' ? version : 0) : null);
      this.runningBody.set(running?.body ?? null);
    } catch (e) {
      this.failure.set(['Could not read the running version: ' + describeHttpError(e).join(' ')]);
    } finally {
      this.loading.set(false);
    }
    const initial = this.initialInput();
    this.text.set(initial ? JSON.stringify(initial, null, 2) : (loadRunInput(this.name()) ?? this.skeletonText()));
    // the textarea appears only now
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>('textarea')?.focus());
  }

  ngOnDestroy(): void {
    if (this.opener?.isConnected) {
      this.opener.focus();
    }
  }

  protected skeletonText(): string {
    return JSON.stringify(inputSkeleton(this.runningBody() ?? this.draft()), null, 2);
  }

  protected canRun(): boolean {
    return !this.loading() && !this.running() && this.runningVersion() !== null && !this.parseError();
  }

  protected async run(): Promise<void> {
    if (!this.canRun()) {
      return;
    }
    const name = this.name();
    const input = JSON.parse(this.text()) as Record<string, unknown>;
    saveRunInput(name, this.text());
    this.running.set(true);
    this.failure.set([]);
    this.outcome.set(null);
    // The execution's createTime is set by the service's clock; allow for some skew when looking it up.
    const since = new Date(Date.now() - 60_000).toISOString();
    try {
      let status: number;
      let body: unknown;
      try {
        const response = await firstValueFrom(this.executions.start(name, input));
        status = response.status;
        body = response.body;
      } catch (e) {
        // A sync run that failed answers 400 (or the httpCode its outputs set) with the run in the body.
        if (e instanceof HttpErrorResponse && isObject(e.error) && typeof e.error['workflowId'] === 'string') {
          status = e.status;
          body = e.error;
        } else {
          throw e;
        }
      }
      this.outcome.set(await this.describe(name, status, body, since));
    } catch (e) {
      this.failure.set(describeHttpError(e));
    } finally {
      this.running.set(false);
    }
  }

  /** The response names the run only for sync workflows without `output.body`; otherwise look the run up. */
  private async describe(name: string, httpStatus: number, body: unknown, since: string): Promise<RunOutcome> {
    const own = isObject(body) && typeof body['workflowId'] === 'string' ? body : null;
    if (own) {
      const status = typeof own['status'] === 'string' ? own['status'] : null;
      return { httpStatus, workflowId: own['workflowId'] as string, status, body, note: status ? '' : 'Started.' };
    }
    try {
      const [latest] = await firstValueFrom(this.executions.latest(name, 1, since));
      if (latest) {
        return {
          httpStatus,
          workflowId: latest.workflowId,
          status: latest.status || null,
          body,
          note: httpStatus === 202 ? 'Started; the service runs it in the background.' : '',
        };
      }
    } catch {
      // older service builds cannot list executions; fall through
    }
    return {
      httpStatus,
      workflowId: null,
      status: null,
      body,
      note: 'Started, but the service did not say which execution it is. Look for it in the executions list.',
    };
  }

  protected openExecution(workflowId: string | null): void {
    this.closed.emit();
    void this.router.navigate(workflowId ? ['/executions', workflowId] : ['/executions']);
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
