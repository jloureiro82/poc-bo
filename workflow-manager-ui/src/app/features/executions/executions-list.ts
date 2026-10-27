import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError } from '../../core/config-api.service';
import { RunStatus, RunSummary, TaskRun, WORKFLOW_STATUSES, WorkflowRun, durationMs, formatDuration, runStatusOf, summarizeRuns } from '../../core/executions';
import { ExecutionsApiService } from '../../core/executions-api.service';
import { CopyId } from '../../shared/copy-id';

const PAGE_SIZE = 25;
/** How many of a workflow's latest runs the health summary covers. */
const HEALTH_RUNS = 50;

@Component({
  selector: 'app-executions-list',
  imports: [CopyId, DatePipe, RouterLink],
  template: `
    <div class="page">
      <header class="toolbar">
        <h1>Executions <span class="muted">{{ total() }} run{{ total() === 1 ? '' : 's' }}</span></h1>
        <div class="toolbar-actions">
          <input class="search" list="workflow-names" placeholder="Workflow name…" [value]="name()"
                 (change)="name.set($any($event.target).value); reload(0)" />
          <input class="search" placeholder="Execution id…" [value]="workflowId()"
                 (change)="workflowId.set($any($event.target).value); reload(0)" />
          <button class="ghost" (click)="compare()" [disabled]="picked().length !== 2"
                  [title]="picked().length === 2 ? 'Compare the two runs you picked' : 'Pick two runs with the boxes on the left'">
            Compare{{ picked().length ? ' (' + picked().length + '/2)' : '' }}
          </button>
          <button class="ghost" (click)="reload(page())" [disabled]="loading()">{{ loading() ? 'Loading…' : '↻ Refresh' }}</button>
        </div>
      </header>

      <div class="status-filter">
        @for (s of statuses; track s) {
          <button class="chip" [class.active]="selected().has(s)" [attr.data-run]="runStatus(s)" (click)="toggle(s)">
            <i class="dot"></i>{{ statusText(s) }}
          </button>
        }
        @if (selected().size) {
          <button class="link" (click)="clearStatuses()">clear</button>
        }
      </div>

      @if (error().length) {
        <div class="banner error">@for (line of error(); track $index) { <div>{{ line }}</div> }</div>
      }

      @if (health(); as h) {
        <section class="card health">
          <div class="card-head">
            <h2>How “{{ h.name }}” has been running</h2>
            <span class="muted small">its last {{ h.summary.total }} run{{ h.summary.total === 1 ? '' : 's' }}, whatever the status filter</span>
          </div>
          <div class="facts">
            @for (s of healthStatuses; track s.key) {
              @if (h.summary.byStatus[s.key]) {
                <div><span class="muted small">{{ s.label }}</span><strong class="run-text" [attr.data-run]="s.key">{{ h.summary.byStatus[s.key] }} · {{ percent(h.summary.byStatus[s.key], h.summary.total) }}</strong></div>
              }
            }
            <div><span class="muted small">Median duration</span><strong>{{ format(h.summary.median) }}</strong></div>
            <div><span class="muted small">95% within</span><strong>{{ format(h.summary.p95) }}</strong></div>
          </div>
          <div class="health-lists">
            <div>
              <h3>Tasks that failed</h3>
              @for (t of h.summary.failedTasks.slice(0, 8); track t.label) {
                <div class="health-row">
                  <code>{{ t.label }}</code>
                  <span class="bar" aria-hidden="true"><i [style.width.%]="100 * t.runs / h.summary.total"></i></span>
                  <span class="small">in {{ t.runs }} of {{ h.summary.total }} runs</span>
                  <a class="small" [routerLink]="['/executions', t.lastWorkflowId]">latest</a>
                </div>
              } @empty {
                <p class="muted small">{{ h.tasksError || 'No task failed in these runs.' }}</p>
              }
            </div>
            <div>
              <h3>Errors of failed runs</h3>
              @for (e of h.summary.errors.slice(0, 6); track e.message) {
                <div class="health-row">
                  <span class="desc small">{{ e.message }}</span>
                  <span class="small">{{ e.runs }}×</span>
                  <a class="small" [routerLink]="['/executions', e.lastWorkflowId]">latest</a>
                </div>
              } @empty {
                <p class="muted small">No failed run recorded an error.</p>
              }
            </div>
          </div>
        </section>
      } @else if (healthNote()) {
        <p class="muted small">{{ healthNote() }}</p>
      }

      <section class="card">
        <table class="executions">
          <thead>
            <tr><th class="pick"><span class="visually-hidden">Pick to compare</span></th><th>Status</th><th>Workflow</th><th>Started</th><th>Duration</th><th>Messenger</th><th>Execution id</th></tr>
          </thead>
          <tbody>
            @for (r of items(); track r.id) {
              <tr class="clickable" (click)="open(r)" [class.picked]="isPicked(r)">
                <td class="pick" (click)="$event.stopPropagation()">
                  <input type="checkbox" [checked]="isPicked(r)" [disabled]="!isPicked(r) && picked().length >= 2"
                         [attr.aria-label]="'Pick ' + r.name + ' ' + r.workflowId + ' to compare'" (change)="pick(r)" />
                </td>
                <td><span class="pill run" [attr.data-run]="runStatus(r.status)">{{ statusText(r.status) }}</span></td>
                <td><a class="row-link" [routerLink]="['/executions', r.workflowId]" (click)="$event.stopPropagation()"><strong>{{ r.name }}</strong></a></td>
                <td>{{ (r.startTime ?? r.createTime) | date: 'yyyy-MM-dd HH:mm:ss' }}</td>
                <td>{{ duration(r) }}</td>
                <td>{{ r.messengerProvider ?? '—' }}</td>
                <td><app-copy-id class="muted" [value]="r.workflowId" /></td>
              </tr>
            } @empty {
              @if (!loading()) {
                <tr><td colspan="7" class="muted">No executions match.</td></tr>
              }
            }
          </tbody>
        </table>
        <div class="pager">
          <button class="ghost" [disabled]="page() === 0 || loading()" (click)="reload(page() - 1)">← Newer</button>
          <span class="muted small">Page {{ page() + 1 }} of {{ pages() }}</span>
          <button class="ghost" [disabled]="page() + 1 >= pages() || loading()" (click)="reload(page() + 1)">Older →</button>
        </div>
      </section>
    </div>
    <datalist id="workflow-names">
      @for (n of names(); track n) { <option [value]="n"></option> }
    </datalist>
  `,
})
export class ExecutionsList {
  private readonly api = inject(ExecutionsApiService);
  private readonly configs = inject(ConfigApiService);
  private readonly router = inject(Router);

  protected readonly statuses = WORKFLOW_STATUSES;
  protected readonly items = signal<WorkflowRun[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string[]>([]);
  protected readonly selected = signal(new Set<string>());
  protected readonly name = signal('');
  protected readonly workflowId = signal('');
  protected readonly names = signal<string[]>([]);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  /** Runs picked for comparison (execution ids), at most two. */
  protected readonly picked = signal<string[]>([]);
  /** Shown when the name filter is exactly the name of a workflow. */
  protected readonly health = signal<{ name: string; summary: RunSummary; tasksError: string } | null>(null);
  protected readonly healthNote = signal('');
  protected readonly healthStatuses: { key: RunStatus; label: string }[] = [
    { key: 'ok', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
    { key: 'cancelled', label: 'Rejected' },
    { key: 'held', label: 'Stopped' },
    { key: 'running', label: 'Not finished' },
  ];

  constructor() {
    void this.reload(0);
    firstValueFrom(this.configs.list())
      .then(list => this.names.set([...new Set(list.map(w => w.name))].sort()))
      .catch(() => undefined);
  }

  protected async reload(page: number): Promise<void> {
    this.loading.set(true);
    this.error.set([]);
    try {
      const result = await firstValueFrom(
        this.api.runs({ page, size: PAGE_SIZE, statuses: [...this.selected()], name: this.name(), workflowId: this.workflowId() }),
      );
      this.items.set(result.items);
      this.total.set(result.total);
      this.page.set(page);
    } catch (e) {
      this.error.set(describeHttpError(e));
    } finally {
      this.loading.set(false);
    }
    void this.loadHealth();
  }

  /** The health summary covers one workflow, so it shows only when the name filter is exactly a workflow's name. */
  private async loadHealth(): Promise<void> {
    const name = this.name().trim();
    if (!name) {
      this.health.set(null);
      this.healthNote.set('Type a workflow’s full name in the filter to see how its last runs went.');
      return;
    }
    try {
      const runs = await firstValueFrom(this.api.latest(name, HEALTH_RUNS));
      if (!runs.length) {
        this.health.set(null);
        this.healthNote.set(this.names().length && !this.names().includes(name) ? 'Type a workflow’s full name to see how its last runs went.' : '');
        return;
      }
      let failed: TaskRun[] = [];
      let tasksError = '';
      try {
        failed = await firstValueFrom(this.api.failedTasks(runs.map(r => r.workflowId)));
      } catch (e) {
        tasksError = 'Could not read the task executions: ' + describeHttpError(e).join(' ');
      }
      this.health.set({ name, summary: summarizeRuns(runs, failed), tasksError });
      this.healthNote.set('');
    } catch {
      // the list itself shows the error
      this.health.set(null);
      this.healthNote.set('');
    }
  }

  protected isPicked(run: WorkflowRun): boolean {
    return this.picked().includes(run.workflowId);
  }

  protected pick(run: WorkflowRun): void {
    this.picked.update(list =>
      list.includes(run.workflowId) ? list.filter(id => id !== run.workflowId) : [...list, run.workflowId].slice(-2),
    );
  }

  protected compare(): void {
    const [a, b] = this.picked();
    if (a && b) {
      void this.router.navigate(['/executions/compare', a, b]);
    }
  }

  protected percent(part: number, total: number): string {
    return total ? `${Math.round((100 * part) / total)}%` : '—';
  }

  protected format(ms: number | null): string {
    return formatDuration(ms);
  }

  protected toggle(status: string): void {
    this.selected.update(s => {
      const next = new Set(s);
      if (!next.delete(status)) {
        next.add(status);
      }
      return next;
    });
    void this.reload(0);
  }

  protected clearStatuses(): void {
    this.selected.set(new Set());
    void this.reload(0);
  }

  protected open(run: WorkflowRun): void {
    void this.router.navigate(['/executions', run.workflowId]);
  }

  protected duration(r: WorkflowRun): string {
    const start = r.startTime ?? r.createTime;
    return formatDuration(durationMs(start, r.endTime)) + (r.endTime || !start ? '' : ' (running)');
  }

  protected runStatus = runStatusOf;

  protected statusText(status: string): string {
    return status.replace('_', ' ').toLowerCase();
  }
}
