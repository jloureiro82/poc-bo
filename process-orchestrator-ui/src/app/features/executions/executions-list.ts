import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError, toStored } from '../../core/config-api.service';
import { ActivityRun, FLOW_STATUSES, FlowSummary, FlowTrace, RunStatus, WorkflowRun, durationMs, formatDuration, runStatusOf, summarizeFlows } from '../../core/executions';
import { ExecutionsApiService } from '../../core/executions-api.service';
import { CopyId } from '../../shared/copy-id';

const PAGE_SIZE = 25;
/** How many of a flow's latest runs the health summary covers. */
const HEALTH_RUNS = 50;

@Component({
  selector: 'app-executions-list',
  imports: [CopyId, DatePipe, RouterLink],
  template: `
    <div class="page">
      <header class="toolbar">
        <h1>Executions <span class="muted">{{ total() }} run{{ total() === 1 ? '' : 's' }}</span></h1>
        <div class="toolbar-actions">
          <input class="search" list="flow-names" placeholder="Flow name…" [value]="flowName()"
                 (change)="flowName.set($any($event.target).value); reload(0)" />
          <input class="search" placeholder="Execution id…" [value]="orchestratorId()"
                 (change)="orchestratorId.set($any($event.target).value); reload(0)" />
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
              <h3>Activities that failed</h3>
              @for (a of h.summary.failedActivities.slice(0, 8); track a.label) {
                <div class="health-row">
                  <code>{{ a.label }}</code>
                  <span class="bar" aria-hidden="true"><i [style.width.%]="100 * a.runs / h.summary.total"></i></span>
                  <span class="small">in {{ a.runs }} of {{ h.summary.total }} runs</span>
                  <a class="small" [routerLink]="['/executions', a.lastOrchestratorId]">latest</a>
                </div>
              } @empty {
                <p class="muted small">{{ h.detailError || 'No activity failed in these runs.' }}</p>
              }
            </div>
            <div>
              <h3>Errors of failed activities</h3>
              @for (e of h.summary.errors.slice(0, 6); track e.message) {
                <div class="health-row">
                  <span class="desc small">{{ e.message }}</span>
                  <span class="small">{{ e.runs }}×</span>
                  <a class="small" [routerLink]="['/executions', e.lastOrchestratorId]">latest</a>
                </div>
              } @empty {
                <p class="muted small">No failed activity recorded an error.</p>
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
            <tr><th class="pick"><span class="visually-hidden">Pick to compare</span></th><th>Status</th><th>Flow</th><th>Started</th><th>Duration</th><th>Steps</th><th>Execution id</th></tr>
          </thead>
          <tbody>
            @for (f of items(); track f.id) {
              <tr class="clickable" (click)="open(f)" [class.picked]="isPicked(f)">
                <td class="pick" (click)="$event.stopPropagation()">
                  <input type="checkbox" [checked]="isPicked(f)" [disabled]="!isPicked(f) && picked().length >= 2"
                         [attr.aria-label]="'Pick ' + f.flowName + ' ' + f.orchestratorId + ' to compare'" (change)="pick(f)" />
                </td>
                <td><span class="pill run" [attr.data-run]="runStatus(f.flowStatus)">{{ statusText(f.flowStatus) }}</span></td>
                <td><a class="row-link" [routerLink]="['/executions', f.orchestratorId]" (click)="$event.stopPropagation()"><strong>{{ f.flowName }}</strong></a></td>
                <td>{{ f.startDate | date: 'yyyy-MM-dd HH:mm:ss' }}</td>
                <td>{{ duration(f) }}</td>
                <td>{{ (f.stepCount ?? 0) + 1 }}</td>
                <td><app-copy-id class="muted" [value]="f.orchestratorId" /></td>
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
    <datalist id="flow-names">
      @for (n of flowNames(); track n) { <option [value]="n"></option> }
    </datalist>
  `,
})
export class ExecutionsList {
  private readonly api = inject(ExecutionsApiService);
  private readonly configs = inject(ConfigApiService);
  private readonly router = inject(Router);

  protected readonly statuses = FLOW_STATUSES;
  protected readonly items = signal<FlowTrace[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string[]>([]);
  protected readonly selected = signal(new Set<string>());
  protected readonly flowName = signal('');
  protected readonly orchestratorId = signal('');
  protected readonly flowNames = signal<string[]>([]);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  /** Runs picked for comparison (execution ids), at most two. */
  protected readonly picked = signal<string[]>([]);
  /** Shown when the flow filter is exactly the name of an orchestrator. */
  protected readonly health = signal<{ name: string; summary: FlowSummary; detailError: string } | null>(null);
  protected readonly healthNote = signal('');
  protected readonly healthStatuses: { key: RunStatus; label: string }[] = [
    { key: 'ok', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'held', label: 'On hold' },
    { key: 'running', label: 'Not finished' },
  ];

  constructor() {
    void this.reload(0);
    firstValueFrom(this.configs.list('orchestrator'))
      .then(list => this.flowNames.set([...new Set(list.map(e => toStored('orchestrator', e).name))].sort()))
      .catch(() => undefined);
  }

  protected async reload(page: number): Promise<void> {
    this.loading.set(true);
    this.error.set([]);
    try {
      const result = await firstValueFrom(
        this.api.flows({
          page,
          size: PAGE_SIZE,
          statuses: [...this.selected()],
          flowName: this.flowName(),
          orchestratorId: this.orchestratorId(),
        }),
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

  /** The health summary covers one flow, so it shows only when the flow filter is exactly an orchestrator's name. */
  private async loadHealth(): Promise<void> {
    const name = this.flowName().trim();
    if (!name) {
      this.health.set(null);
      this.healthNote.set('Type a flow’s full name in the filter to see how its last runs went.');
      return;
    }
    try {
      const flows = await firstValueFrom(this.api.latest(name, HEALTH_RUNS));
      if (!flows.length) {
        this.health.set(null);
        this.healthNote.set(this.flowNames().length && !this.flowNames().includes(name) ? 'Type a flow’s full name to see how its last runs went.' : '');
        return;
      }
      let detailError = '';
      let runs: ActivityRun[] = [];
      let failed: WorkflowRun[] = [];
      try {
        runs = await firstValueFrom(this.api.activityRunsOf(flows.map(f => f.orchestratorId)));
        failed = await firstValueFrom(this.api.failedWorkflows([...new Set(runs.map(r => r.activityId).filter(Boolean))]));
      } catch (e) {
        detailError = 'Could not read the activity runs: ' + describeHttpError(e).join(' ');
      }
      this.health.set({ name, summary: summarizeFlows(flows, runs, new Map(failed.map(w => [w.workflowId, w]))), detailError });
      this.healthNote.set('');
    } catch {
      // the list itself shows the error
      this.health.set(null);
      this.healthNote.set('');
    }
  }

  protected isPicked(flow: FlowTrace): boolean {
    return this.picked().includes(flow.orchestratorId);
  }

  protected pick(flow: FlowTrace): void {
    this.picked.update(list =>
      list.includes(flow.orchestratorId) ? list.filter(id => id !== flow.orchestratorId) : [...list, flow.orchestratorId].slice(-2),
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

  protected open(flow: FlowTrace): void {
    void this.router.navigate(['/executions', flow.orchestratorId]);
  }

  protected duration(f: FlowTrace): string {
    return formatDuration(durationMs(f.startDate, f.endDate)) + (f.endDate ? '' : ' (running)');
  }

  protected runStatus = runStatusOf;

  protected statusText(status: string): string {
    return status.replace('_', ' ').toLowerCase();
  }
}
