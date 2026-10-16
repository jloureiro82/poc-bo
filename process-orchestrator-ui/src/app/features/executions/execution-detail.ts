import { DatePipe, JsonPipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError, toStored } from '../../core/config-api.service';
import { queueOpen } from '../../core/drafts';
import {
  ActivityRun,
  FlowTrace,
  StepTrace,
  TaskRun,
  WorkflowRun,
  activityRunStatus,
  buildRunOverlay,
  durationMs,
  formatDuration,
  runStatusOf,
} from '../../core/executions';
import { ExecutionsApiService } from '../../core/executions-api.service';
import { OrchestratorConfig } from '../../core/model';
import { RunInput, startInputOf } from '../../core/run-input';
import { exportDiagram } from '../../shared/diagram-export';
import { RunDialog } from '../../shared/run-dialog';
import { OrchestratorDiagram } from '../orchestrator/orchestrator-diagram';
import { KeyActivate } from '../../shared/key-activate';

interface TimelineRow {
  kind: 'step' | 'run';
  key: string;
  label: string;
  sub: string;
  status: string;
  start: number;
  end: number;
  open: boolean;
  run?: ActivityRun;
}

@Component({
  selector: 'app-execution-detail',
  imports: [DatePipe, JsonPipe, RouterLink, OrchestratorDiagram, KeyActivate, RunDialog],
  templateUrl: './execution-detail.html',
})
export class ExecutionDetail {
  private readonly api = inject(ExecutionsApiService);
  private readonly configs = inject(ConfigApiService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Route parameter. */
  readonly orchestratorId = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal<string[]>([]);
  protected readonly flow = signal<FlowTrace | null>(null);
  protected readonly steps = signal<StepTrace[]>([]);
  protected readonly runs = signal<ActivityRun[]>([]);
  protected readonly workflows = signal(new Map<string, WorkflowRun>());
  protected readonly tasks = signal<TaskRun[]>([]);
  protected readonly config = signal<OrchestratorConfig | null>(null);
  protected readonly configNote = signal('');
  protected readonly selectedRunId = signal<number | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly rerunning = signal(false);
  protected readonly exportNote = signal('');

  /** What the flow was started with, to start it again: the start request its first activity run recorded. */
  protected readonly startInput = computed<RunInput | null>(() => {
    const first = [...this.runs()].sort((a, b) => a.id - b.id)[0];
    return first ? startInputOf(first.input) : null;
  });

  protected readonly overlay = computed(() =>
    buildRunOverlay(this.config(), this.steps(), this.runs(), this.workflows()),
  );

  /** Time axis: from the flow start to its end (or now while it runs). */
  protected readonly span = computed(() => {
    const times: number[] = [];
    const add = (s: string | null) => s && times.push(Date.parse(s));
    const f = this.flow();
    add(f?.startDate ?? null);
    add(f?.endDate ?? null);
    this.steps().forEach(s => (add(s.startDate), add(s.endDate)));
    this.runs().forEach(r => (add(r.startDate), add(r.endDate)));
    const open = !f?.endDate || this.runs().some(r => !r.endDate);
    if (open) {
      times.push(this.now());
    }
    const start = Math.min(...times);
    const end = Math.max(...times);
    return { start, end: end > start ? end : start + 1 };
  });

  protected readonly rows = computed<TimelineRow[]>(() => {
    const rows: TimelineRow[] = [];
    const ms = (s: string | null, fallback: number) => (s ? Date.parse(s) : fallback);
    const now = this.now();
    const steps = [...this.steps()].sort((a, b) => a.id - b.id);
    const runs = [...this.runs()].sort((a, b) => a.id - b.id);
    const seen = new Set<number>();
    for (const step of steps) {
      rows.push({
        kind: 'step',
        key: `s${step.id}`,
        label: step.stepName,
        sub: `step · ${step.stepStatus.toLowerCase().replace('_', ' ')}`,
        status: runStatusOf(step.stepStatus),
        start: ms(step.startDate, now),
        end: ms(step.endDate, now),
        open: !step.endDate,
      });
      for (const run of runs.filter(r => r.stepId === step.stepId)) {
        seen.add(run.id);
        rows.push(this.runRow(run, now));
      }
    }
    // Runs whose step trace is missing (should not happen, but never hide data)
    for (const run of runs.filter(r => !seen.has(r.id))) {
      rows.push(this.runRow(run, now));
    }
    return rows;
  });

  protected readonly ticks = computed(() => {
    const { start, end } = this.span();
    return [0, 0.25, 0.5, 0.75, 1].map(f => ({ left: f * 100, label: f === 0 ? '0' : `+${formatDuration((end - start) * f)}` }));
  });

  protected readonly selectedRun = computed(() => this.runs().find(r => r.id === this.selectedRunId()) ?? null);
  protected readonly selectedWorkflow = computed(() => {
    const run = this.selectedRun();
    return run ? (this.workflows().get(run.activityId) ?? null) : null;
  });
  protected readonly selectedTasks = computed(() => {
    const run = this.selectedRun();
    return run ? this.tasks().filter(t => t.workflowId === run.activityId).sort((a, b) => a.id - b.id) : [];
  });
  /** Task bars are placed relative to their own workflow execution. */
  protected readonly taskSpan = computed(() => {
    const wf = this.selectedWorkflow();
    const tasks = this.selectedTasks();
    const times = [wf?.startTime, wf?.endTime, ...tasks.flatMap(t => [t.startTime, t.endTime])]
      .filter((t): t is string => !!t)
      .map(t => Date.parse(t));
    if (!times.length) {
      return { start: 0, end: 1 };
    }
    const start = Math.min(...times);
    const end = Math.max(...times);
    return { start, end: end > start ? end : start + 1 };
  });

  constructor() {
    // The page is reused when only the execution id in the URL changes, so (re)load whenever it does.
    effect(() => {
      this.orchestratorId();
      untracked(() => {
        this.selectedRunId.set(null);
        this.flow.set(null);
        void this.load();
      });
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set([]);
    this.now.set(Date.now());
    const id = this.orchestratorId();
    try {
      const [flow, steps, runs] = await Promise.all([
        firstValueFrom(this.api.flow(id)),
        firstValueFrom(this.api.steps(id)),
        firstValueFrom(this.api.activityRuns(id)),
      ]);
      if (!flow) {
        this.error.set([`No execution with id ${id}`]);
        return;
      }
      this.flow.set(flow);
      this.steps.set(steps);
      this.runs.set(runs);
      const ids = [...new Set(runs.map(r => r.activityId).filter(Boolean))];
      const [workflows, tasks] = await Promise.all([firstValueFrom(this.api.workflows(ids)), firstValueFrom(this.api.tasks(ids))]);
      this.workflows.set(new Map(workflows.map(w => [w.workflowId, w])));
      this.tasks.set(tasks);
      if (this.selectedRunId() == null) {
        // Start on the most telling run: the last failure, else the last run.
        const failed = [...runs].reverse().find(r => activityRunStatus(r, this.workflows()) === 'failed');
        this.selectedRunId.set((failed ?? runs[runs.length - 1])?.id ?? null);
      }
      await this.loadConfig(flow.flowName);
    } catch (e) {
      this.error.set(describeHttpError(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** The traces do not record which configuration version ran, so the active one (else the newest) is drawn. */
  private async loadConfig(flowName: string): Promise<void> {
    try {
      const versions = (await firstValueFrom(this.configs.versions('orchestrator', flowName))).map(v => toStored('orchestrator', v));
      const chosen = versions.find(v => v.details.active && !v.details.deprecated) ?? versions[0];
      this.config.set((chosen?.body as OrchestratorConfig) ?? null);
      this.configNote.set(
        chosen
          ? `Drawn on ${chosen.details.active && !chosen.details.deprecated ? 'the active' : 'the newest'} version (v${chosen.details.version}) of ${flowName}; the run may have used an older one.`
          : `No configuration named ${flowName} is stored, so only the timeline is shown.`,
      );
    } catch {
      this.config.set(null);
      this.configNote.set(`Could not load the configuration of ${flowName}.`);
    }
  }

  protected selectFromDiagram(path: string): void {
    // Clicking an activity selects its latest run.
    const m = /^stepList\[(\d+)\]\.activityList\[(\d+)\]/.exec(path);
    const cfg = this.config();
    if (!m || !cfg?.stepList) {
      return;
    }
    const step = cfg.stepList[Number(m[1])];
    const activity = step?.activityList?.[Number(m[2])];
    const runs = this.runs().filter(r => r.stepName === step?.label && (r.activity === activity?.label || r.activity === activity?.cancellationActivity?.label));
    if (runs.length) {
      this.selectedRunId.set(runs[runs.length - 1].id);
      document.getElementById('run-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  protected openConfig(): void {
    const cfg = this.config();
    if (cfg) {
      queueOpen('orchestrator', cfg, `Opened the configuration of execution ${this.orchestratorId().slice(0, 8)}…`);
      void this.router.navigate(['/orchestrator']);
    }
  }

  protected async exportPicture(format: 'svg' | 'png'): Promise<void> {
    const svg = this.host.nativeElement.querySelector<SVGSVGElement>('.diagram-card app-orchestrator-diagram svg');
    const flow = this.flow();
    if (!svg || !flow) {
      return;
    }
    try {
      this.exportNote.set('');
      await exportDiagram(svg, format, `${flow.flowName}-${flow.orchestratorId.slice(0, 8)}`);
    } catch (e) {
      this.exportNote.set(`Could not save the picture: ${(e as Error).message}`);
    }
  }

  // ---- template helpers ----------------------------------------------------------------------------------------

  protected left(t: number, span = this.span()): number {
    return ((t - span.start) / (span.end - span.start)) * 100;
  }

  protected width(start: number, end: number, span = this.span()): number {
    return Math.max(0.6, ((end - start) / (span.end - span.start)) * 100);
  }

  protected taskStart(t: TaskRun): number {
    return Date.parse(t.startTime ?? t.createTime ?? '') || this.taskSpan().start;
  }

  protected taskEnd(t: TaskRun): number {
    return t.endTime ? Date.parse(t.endTime) : this.taskSpan().end;
  }

  protected duration(start: string | null, end: string | null): string {
    return formatDuration(durationMs(start, end, this.now()));
  }

  protected runStatusOf = runStatusOf;
  protected readonly noIssues = new Map();

  protected formatSpan(row: TimelineRow): string {
    return formatDuration(row.end - row.start) + (row.open ? ' (running)' : '');
  }

  protected runStatus(run: ActivityRun): string {
    return activityRunStatus(run, this.workflows());
  }

  protected statusText(status: string | null | undefined): string {
    return (status ?? '').replace('_', ' ').toLowerCase();
  }

  protected firstLines(stack: string[] | undefined, n = 6): string {
    return (stack ?? []).slice(0, n).join('\n');
  }

  private runRow(run: ActivityRun, now: number): TimelineRow {
    const wf = this.workflows().get(run.activityId);
    return {
      kind: 'run',
      key: `r${run.id}`,
      label: run.activity,
      sub: `${run.type}${wf ? ` · ${wf.label}` : ''}`,
      status: activityRunStatus(run, this.workflows()),
      start: run.startDate ? Date.parse(run.startDate) : now,
      end: run.endDate ? Date.parse(run.endDate) : now,
      open: !run.endDate,
      run,
    };
  }
}
