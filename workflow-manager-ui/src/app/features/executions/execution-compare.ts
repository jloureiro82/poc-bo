import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { describeHttpError } from '../../core/config-api.service';
import { FieldChange, diffValues, diffWorkflows, preview } from '../../core/diff';
import { TaskRun, WorkflowRun, compareTaskRuns, durationMs, formatDuration, runStatusOf } from '../../core/executions';
import { ExecutionsApiService } from '../../core/executions-api.service';
import { lastListParams } from '../../core/list-query';
import { CopyId } from '../../shared/copy-id';

interface Side {
  run: WorkflowRun;
  tasks: TaskRun[];
}

/** Two runs side by side: outcome, timing, task by task, and what differs in their input, output and definition. */
@Component({
  selector: 'app-execution-compare',
  imports: [CopyId, DatePipe, NgTemplateOutlet, RouterLink],
  template: `
    <div class="page execution compare">
      <header class="toolbar">
        <h1><a routerLink="/executions" [queryParams]="listParams" class="back" title="Back to the list">←</a> Compare runs</h1>
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
                  <td><a [routerLink]="['/executions', s.run.workflowId]"><strong>{{ s.run.name }}</strong></a><br /><app-copy-id class="muted small" [value]="s.run.workflowId" /></td>
                }
              </tr>
              <tr>
                <th>Status</th>
                @for (s of sides(); track $index) {
                  <td><span class="pill run" [attr.data-run]="runStatusOf(s.run.status)">{{ statusText(s.run.status) }}</span></td>
                }
              </tr>
              <tr>
                <th>Started</th>
                @for (s of sides(); track $index) { <td>{{ (s.run.startTime ?? s.run.createTime) | date: 'yyyy-MM-dd HH:mm:ss' }}</td> }
              </tr>
              <tr>
                <th>Duration</th>
                @for (s of sides(); track $index) { <td>{{ duration(s.run) }}</td> }
              </tr>
              <tr>
                <th>Definition</th>
                @for (s of sides(); track $index) { <td>{{ version(s.run) }}</td> }
              </tr>
              <tr>
                <th>Error</th>
                @for (s of sides(); track $index) { <td class="desc">{{ s.run.error[0]?.message ?? '—' }}</td> }
              </tr>
            </tbody>
          </table>
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Task by task</h2>
            <span class="muted small">{{ differing() }} of {{ taskRows().length }} task{{ taskRows().length === 1 ? '' : 's' }} fared differently</span>
            <label class="check small"><input type="checkbox" [checked]="onlyDiffs()" (change)="onlyDiffs.set($any($event.target).checked)" /> Only differences</label>
          </div>
          <table class="compare-table">
            <thead><tr><th>Task</th><th>A</th><th>B</th></tr></thead>
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
                <tr><td colspan="3" class="muted">{{ onlyDiffs() ? 'Every task fared the same in both runs.' : 'No task executions are recorded.' }}</td></tr>
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
                    @if (c.path.startsWith('task ')) {
                      @if (c.after) { <span class="change-values">{{ c.after }}</span> }
                    } @else {
                      <span class="change-values">{{ preview(c.before, 120) }} → {{ preview(c.after, 120) }}</span>
                    }
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
  /** The list's page and filters, for the ← link. */
  protected readonly listParams = lastListParams();

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

  protected readonly taskRows = computed(() => {
    const [x, y] = this.sides();
    return x && y ? compareTaskRuns(x.tasks, y.tasks) : [];
  });
  protected readonly differing = computed(() => this.taskRows().filter(r => r.differs).length);
  protected readonly shownRows = computed(() => (this.onlyDiffs() ? this.taskRows().filter(r => r.differs) : this.taskRows()));

  protected readonly blocks = computed<{ title: string; changes: FieldChange[]; same: string }[]>(() => {
    const [x, y] = this.sides();
    if (!x || !y) {
      return [];
    }
    const definition = diffWorkflows(x.run.workflowDefinition, y.run.workflowDefinition);
    const definitionChanges: FieldChange[] = [
      ...definition.fields,
      ...definition.tasks.map(
        (t): FieldChange => ({
          path: `task ${t.label}`,
          kind: t.kind === 'added' || t.kind === 'removed' ? t.kind : 'changed',
          after: t.kind === 'moved' ? `moved, now in ${t.where}` : t.kind === 'changed' ? t.fields.map(f => f.path).join(', ') : undefined,
        }),
      ),
    ];
    return [
      { title: 'Input', changes: diffValues(x.run.inputs ?? {}, y.run.inputs ?? {}).filter(c => c.path !== 'workflowId'), same: 'Both runs had the same input.' },
      { title: 'Output', changes: diffValues(x.run.outputs ?? {}, y.run.outputs ?? {}), same: 'Both runs gave the same output.' },
      {
        title: 'Definition',
        changes: x.run.workflowDefinition && y.run.workflowDefinition ? definitionChanges : [],
        same: x.run.workflowDefinition && y.run.workflowDefinition ? 'Both runs used the same definition.' : 'A run did not keep its definition, so they cannot be compared.',
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
    const [run, tasks] = await Promise.all([firstValueFrom(this.api.run(id)), firstValueFrom(this.api.tasks(id))]);
    if (!run) {
      throw new Error(`No execution with id ${id}`);
    }
    return { run, tasks };
  }

  protected swap(): void {
    this.swapped.update(s => !s);
  }

  protected version(run: WorkflowRun): string {
    const v = run.workflowDefinition?.['version'];
    return run.workflowDefinition ? (v != null ? `v${v}` : 'kept (no version)') : 'not kept';
  }

  protected duration(run: WorkflowRun): string {
    return formatDuration(durationMs(run.startTime ?? run.createTime, run.endTime));
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

