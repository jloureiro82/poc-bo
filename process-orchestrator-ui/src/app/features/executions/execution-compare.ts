import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { describeHttpError } from '../../core/config-api.service';
import { FieldChange, diffValues, preview } from '../../core/diff';
import { ActivityRun, FlowTrace, StepTrace, WorkflowRun, compareActivityRuns, durationMs, formatDuration, runStatusOf } from '../../core/executions';
import { ExecutionsApiService } from '../../core/executions-api.service';
import { startInputOf } from '../../core/run-input';

interface Side {
  flow: FlowTrace;
  steps: StepTrace[];
  runs: ActivityRun[];
  workflows: Map<string, WorkflowRun>;
}

/** Two flows side by side: outcome, timing, activity by activity, and what differs in their request and response. */
@Component({
  selector: 'app-execution-compare',
  imports: [DatePipe, NgTemplateOutlet, RouterLink],
  template: `
    <div class="page execution compare">
      <header class="toolbar">
        <h1><a routerLink="/executions" class="back" title="Back to the list">←</a> Compare runs</h1>
        <div class="toolbar-actions">
          <button class="ghost" (click)="swap()" title="Swap the two runs">⇄ Swap</button>
          <button class="ghost" (click)="load()" [disabled]="loading()">{{ loading() ? 'Loading…' : '↻ Refresh' }}</button>
        </div>
      </header>

      @if (error().length) {
        <div class="banner error">@for (line of error(); track $index) { <div>{{ line }}</div> }</div>
      }

      @if (left() && right()) {
        <section class="card">
          <table class="compare-table">
            <thead>
              <tr><th></th><th>A</th><th>B</th></tr>
            </thead>
            <tbody>
              <tr>
                <th>Run</th>
                @for (s of sides(); track $index) {
                  <td><a [routerLink]="['/executions', s.flow.orchestratorId]"><strong>{{ s.flow.flowName }}</strong></a><br /><code class="muted small">{{ s.flow.orchestratorId }}</code></td>
                }
              </tr>
              <tr>
                <th>Status</th>
                @for (s of sides(); track $index) {
                  <td><span class="pill run" [attr.data-run]="runStatusOf(s.flow.flowStatus)">{{ statusText(s.flow.flowStatus) }}</span></td>
                }
              </tr>
              <tr>
                <th>Started</th>
                @for (s of sides(); track $index) { <td>{{ s.flow.startDate | date: 'yyyy-MM-dd HH:mm:ss' }}</td> }
              </tr>
              <tr>
                <th>Duration</th>
                @for (s of sides(); track $index) { <td>{{ duration(s.flow) }}</td> }
              </tr>
              <tr>
                <th>Steps entered</th>
                @for (s of sides(); track $index) { <td>{{ s.steps.length }}</td> }
              </tr>
              <tr>
                <th>First error</th>
                @for (s of sides(); track $index) { <td class="desc">{{ firstError(s) }}</td> }
              </tr>
            </tbody>
          </table>
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Activity by activity</h2>
            <span class="muted small">{{ differing() }} of {{ rows().length }} activit{{ rows().length === 1 ? 'y' : 'ies' }} fared differently</span>
            <label class="check small"><input type="checkbox" [checked]="onlyDiffs()" (change)="onlyDiffs.set($any($event.target).checked)" /> Only differences</label>
          </div>
          <table class="compare-table">
            <thead><tr><th>Step / activity</th><th>A</th><th>B</th></tr></thead>
            <tbody>
              @for (row of shownRows(); track row.label) {
                <tr [class.differs]="row.differs">
                  <th><code>{{ row.label }}</code></th>
                  <td>
                    @if (row.a; as x) { <ng-container *ngTemplateOutlet="cell; context: { $implicit: x }" /> } @else { <span class="muted">did not run</span> }
                  </td>
                  <td>
                    @if (row.b; as x) { <ng-container *ngTemplateOutlet="cell; context: { $implicit: x }" /> } @else { <span class="muted">did not run</span> }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="muted">{{ onlyDiffs() ? 'Every activity fared the same in both runs.' : 'No activity runs are recorded.' }}</td></tr>
              }
            </tbody>
          </table>
        </section>

        <section class="card">
          <div class="card-head"><h2>What differs</h2></div>
          @for (block of blocks(); track block.title) {
            <h3>{{ block.title }}</h3>
            @if (block.changes.length) {
              <ul class="change-list">
                @for (c of block.changes; track c.path) {
                  <li [attr.data-change]="c.kind">
                    <span class="change-kind">{{ c.kind }}</span> <code>{{ c.path }}</code>
                    <span class="change-values">{{ preview(c.before, 120) }} → {{ preview(c.after, 120) }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted small">{{ block.same }}</p>
            }
          }
        </section>
      } @else if (loading()) {
        <p class="muted">Loading the runs…</p>
      }
    </div>

    <ng-template #cell let-x>
      <span class="pill run" [attr.data-run]="runStatusOf(x.status)">{{ statusText(x.status) }}</span>
      <span class="muted small"> {{ format(x.durationMs) }}@if (x.attempts > 1) { · ran {{ x.attempts }} times }</span>
    </ng-template>
  `,
})
export class ExecutionCompare {
  private readonly api = inject(ExecutionsApiService);

  readonly a = input.required<string>();
  readonly b = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal<string[]>([]);
  protected readonly left = signal<Side | null>(null);
  protected readonly right = signal<Side | null>(null);
  protected readonly onlyDiffs = signal(false);
  private readonly swapped = signal(false);

  protected readonly sides = computed(() => {
    const pair = [this.left(), this.right()].filter((s): s is Side => !!s);
    return this.swapped() ? pair.reverse() : pair;
  });

  protected readonly rows = computed(() => {
    const [x, y] = this.sides();
    return x && y ? compareActivityRuns(x.runs, x.workflows, y.runs, y.workflows) : [];
  });
  protected readonly differing = computed(() => this.rows().filter(r => r.differs).length);
  protected readonly shownRows = computed(() => (this.onlyDiffs() ? this.rows().filter(r => r.differs) : this.rows()));

  /**
   * The request each flow started with is recorded on its first activity run. What a flow ended with is the outputs of
   * its last workflow execution (an activity run's own `output` repeats its input, so it is not used).
   */
  protected readonly blocks = computed<{ title: string; changes: FieldChange[]; same: string }[]>(() => {
    const [x, y] = this.sides();
    if (!x || !y) {
      return [];
    }
    const first = (s: Side) => [...s.runs].sort((p, q) => p.id - q.id)[0];
    const lastOutputs = (s: Side) => {
      const run = [...s.runs].sort((p, q) => q.id - p.id).find(r => s.workflows.has(r.activityId));
      const { orchestrationId, workflowId, ...rest } = (run && s.workflows.get(run.activityId)?.outputs) || {};
      return rest;
    };
    return [
      {
        title: 'Start request',
        changes: diffValues(startInputOf(first(x)?.input ?? null), startInputOf(first(y)?.input ?? null)),
        same: 'Both runs started with the same request.',
      },
      {
        title: 'Outputs of the last workflow',
        changes: diffValues(lastOutputs(x), lastOutputs(y)),
        same: 'Both runs ended with the same outputs.',
      },
    ];
  });

  constructor() {
    effect(() => {
      this.a();
      this.b();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set([]);
    try {
      const [left, right] = await Promise.all([this.side(this.a()), this.side(this.b())]);
      this.left.set(left);
      this.right.set(right);
    } catch (e) {
      this.error.set(e instanceof Error && !('status' in e) ? [e.message] : describeHttpError(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async side(id: string): Promise<Side> {
    const [flow, steps, runs] = await Promise.all([
      firstValueFrom(this.api.flow(id)),
      firstValueFrom(this.api.steps(id)),
      firstValueFrom(this.api.activityRuns(id)),
    ]);
    if (!flow) {
      throw new Error(`No execution with id ${id}`);
    }
    const workflows = await firstValueFrom(this.api.workflows([...new Set(runs.map(r => r.activityId).filter(Boolean))]));
    return { flow, steps, runs, workflows: new Map(workflows.map(w => [w.workflowId, w])) };
  }

  protected swap(): void {
    this.swapped.update(s => !s);
  }

  protected firstError(side: Side): string {
    for (const run of [...side.runs].sort((p, q) => p.id - q.id)) {
      const message = side.workflows.get(run.activityId)?.error?.find(e => e.message)?.message ?? (run.result === 'NOK' ? run.responseMessage : null);
      if (message) {
        return `${run.stepName} / ${run.activity}: ${message}`;
      }
    }
    return '—';
  }

  protected duration(flow: FlowTrace): string {
    return formatDuration(durationMs(flow.startDate, flow.endDate)) + (flow.endDate ? '' : ' (running)');
  }

  protected format(ms: number | null): string {
    return formatDuration(ms);
  }

  protected readonly runStatusOf = runStatusOf;
  protected readonly preview = preview;

  protected statusText(status: string | null | undefined): string {
    return (status ?? '').replace('_', ' ').toLowerCase();
  }
}
