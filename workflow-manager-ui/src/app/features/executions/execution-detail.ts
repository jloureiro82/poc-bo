import { DatePipe, JsonPipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError } from '../../core/config-api.service';
import { queueOpen } from '../../core/drafts';
import { TaskRun, WorkflowRun, buildTaskOverlay, durationMs, findTaskTrace, formatDuration, inRunOrder, retryRefusal, runStatusOf } from '../../core/executions';
import { ExecutionsApiService } from '../../core/executions-api.service';
import { lastListParams } from '../../core/list-query';
import { CopyId } from '../../shared/copy-id';
import { Severity } from '../../core/issues';
import { getAt, isObject, parsePath } from '../../core/json-path';
import { WorkflowDefinition } from '../../core/model';
import { reusableInput } from '../../core/run-input';
import { exportDiagram } from '../../shared/diagram-export';
import { KeyActivate } from '../../shared/key-activate';
import { RunDialog } from '../../shared/run-dialog';
import { FlowItem, TaskFlow } from '../workflow/task-flow';

@Component({
  selector: 'app-execution-detail',
  imports: [CopyId, DatePipe, JsonPipe, RouterLink, TaskFlow, KeyActivate, RunDialog],
  templateUrl: './execution-detail.html',
})
export class ExecutionDetail {
  private readonly api = inject(ExecutionsApiService);
  /** The list's page and filters, for the ← link. */
  protected readonly listParams = lastListParams();
  private readonly configs = inject(ConfigApiService);
  private readonly router = inject(Router);

  /** Route parameter: the execution's `workflowId`. */
  readonly workflowId = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal<string[]>([]);
  protected readonly run = signal<WorkflowRun | null>(null);
  protected readonly tasks = signal<TaskRun[]>([]);
  protected readonly definition = signal<WorkflowDefinition | null>(null);
  protected readonly definitionNote = signal('');
  protected readonly selectedTaskId = signal<number | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly rerunning = signal(false);
  /** This run's input, without what the service added, to start a new run with. */
  protected readonly rerunInput = computed(() => reusableInput(this.run()?.inputs ?? null));
  /** Why this run cannot be retried, or `null` when it can. */
  protected readonly retryBlocked = computed(() => {
    const run = this.run();
    return run ? retryRefusal(run) : 'No run loaded.';
  });
  protected readonly retrying = signal(false);
  /** A one-off message above the run, e.g. after a retry. */
  protected readonly notice = signal<string | null>(null);
  private readonly diagram = viewChild<ElementRef<HTMLElement>>('diagram');

  protected readonly overlay = computed(() => buildTaskOverlay(this.definition(), this.tasks()));

  protected readonly rootItems = computed<FlowItem[]>(() => {
    const tasks = this.definition()?.tasks;
    return Array.isArray(tasks) ? tasks.map((t, i) => ({ task: isObject(t) ? t : {}, path: ['tasks', i] })) : [];
  });

  /** Time axis: from the run's start to its end (or now while it runs). */
  protected readonly span = computed(() => {
    const run = this.run();
    const times = [run?.createTime, run?.startTime, run?.endTime, ...this.tasks().flatMap(t => [t.createTime, t.startTime, t.endTime])]
      .filter((t): t is string => !!t)
      .map(t => Date.parse(t));
    if (!run?.endTime || this.tasks().some(t => !t.endTime)) {
      times.push(this.now());
    }
    const start = Math.min(...times);
    const end = Math.max(...times);
    return { start, end: end > start ? end : start + 1 };
  });

  protected readonly ticks = computed(() => {
    const { start, end } = this.span();
    return [0, 0.25, 0.5, 0.75, 1].map(f => ({ left: f * 100, label: f === 0 ? '0' : `+${formatDuration((end - start) * f)}` }));
  });

  protected readonly selectedTask = computed(() => this.tasks().find(t => t.id === this.selectedTaskId()) ?? null);

  /** The selected execution as the engine saved it, else what the run kept under the task's label. */
  protected readonly selectedTrace = computed(() => {
    const task = this.selectedTask();
    return task ? (task.trace ?? findTaskTrace(this.run()?.execution, task.label)) : null;
  });

  protected readonly selectedRuns = computed(() => {
    const task = this.selectedTask();
    return task ? this.tasks().filter(t => t.label === task.label).length : 0;
  });

  constructor() {
    // The page is reused when only the execution id in the URL changes, so (re)load whenever it does.
    effect(() => {
      this.workflowId();
      untracked(() => {
        this.selectedTaskId.set(null);
        this.run.set(null);
        this.notice.set(null);
        void this.load();
      });
    });
  }

  /**
   * Retries this run: the service continues it from where it stopped, so the tasks that failed run again (and call
   * what they call again). Asks first, because that cannot be undone.
   */
  protected async retry(): Promise<void> {
    const run = this.run();
    if (!run || this.retryBlocked() || this.retrying()) {
      return;
    }
    if (!confirm(`Retry ${run.name} (${run.workflowId})? The service continues this run from where it stopped, so the tasks that failed run again, with their calls. This cannot be undone.`)) {
      return;
    }
    this.retrying.set(true);
    this.notice.set(null);
    try {
      await firstValueFrom(this.api.retry(run.workflowId));
      this.notice.set(`Retry started for ${run.workflowId}. The run continues below; Refresh shows its progress.`);
      await this.load();
      // the service saves task executions asynchronously: look again shortly, if this run is still the one shown
      setTimeout(() => {
        if (this.workflowId() === run.workflowId && !this.loading()) {
          void this.load();
        }
      }, 2500);
    } catch (e) {
      const status = (e as { status?: number }).status;
      this.error.set(
        status === 429
          ? ['The service is running too many workflows right now (429). Try again in a moment.']
          : describeHttpError(e),
      );
    } finally {
      this.retrying.set(false);
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set([]);
    this.now.set(Date.now());
    const id = this.workflowId();
    try {
      const [run, tasks] = await Promise.all([firstValueFrom(this.api.run(id)), firstValueFrom(this.api.tasks(id))]);
      if (!run) {
        this.error.set([`No execution with id ${id}`]);
        return;
      }
      const ordered = inRunOrder(tasks);
      this.run.set(run);
      this.tasks.set(ordered);
      if (this.selectedTaskId() == null) {
        // Start on the most telling task: the last failure, else the last one that ran.
        const failed = [...ordered].reverse().find(t => runStatusOf(t.status) === 'failed');
        this.selectedTaskId.set((failed ?? ordered[ordered.length - 1])?.id ?? null);
      }
      await this.loadDefinition(run);
    } catch (e) {
      this.error.set(describeHttpError(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** The run keeps the definition it used. Only when that is missing is the version running now drawn instead. */
  private async loadDefinition(run: WorkflowRun): Promise<void> {
    if (run.workflowDefinition) {
      this.definition.set(run.workflowDefinition as WorkflowDefinition);
      const version = run.workflowDefinition['version'];
      this.definitionNote.set(`Drawn on the definition this run used${version != null ? ` (v${version})` : ''}.`);
      return;
    }
    try {
      const running = await firstValueFrom(this.configs.running(run.name));
      this.definition.set(running?.body ?? null);
      this.definitionNote.set(
        running
          ? `This run did not keep its definition, so it is drawn on the version running now (v${running.details.version}); the run may have used another one.`
          : `This run did not keep its definition and the service runs no workflow named ${run.name}, so only the timeline is shown.`,
      );
    } catch {
      this.definition.set(null);
      this.definitionNote.set(`Could not load the definition of ${run.name}.`);
    }
  }

  /** Clicking a task on the diagram selects its latest execution. */
  protected selectFromDiagram(path: string): void {
    const node = getAt(this.definition(), parsePath(path));
    const label = isObject(node) ? node['label'] : null;
    const runs = this.tasks().filter(t => t.label === label);
    if (runs.length) {
      this.selectedTaskId.set(runs[runs.length - 1].id);
      document.getElementById('task-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  protected async exportPicture(format: 'svg' | 'png'): Promise<void> {
    const el = this.diagram()?.nativeElement;
    if (el) {
      await exportDiagram(el, format, `${this.run()?.name ?? 'workflow'}-run-${this.workflowId().slice(0, 8)}`);
    }
  }

  protected openDefinition(): void {
    const definition = this.definition();
    if (definition) {
      queueOpen('workflow', definition, `Opened the definition of execution ${this.workflowId().slice(0, 8)}…`);
      void this.router.navigate(['/workflow']);
    }
  }

  // ---- template helpers ----------------------------------------------------------------------------------------

  protected left(t: number): number {
    const span = this.span();
    return ((t - span.start) / (span.end - span.start)) * 100;
  }

  protected width(start: number, end: number): number {
    const span = this.span();
    return Math.max(0.6, ((end - start) / (span.end - span.start)) * 100);
  }

  protected taskStart(t: TaskRun): number {
    return Date.parse(t.startTime ?? t.createTime ?? '') || this.span().start;
  }

  protected taskEnd(t: TaskRun): number {
    return t.endTime ? Date.parse(t.endTime) : this.span().end;
  }

  protected duration(start: string | null, end: string | null): string {
    return formatDuration(durationMs(start, end, this.now()));
  }

  protected runStatusOf = runStatusOf;
  protected readonly noIssues = new Map<string, Severity>();

  protected statusText(status: string | null | undefined): string {
    return (status ?? '').replace('_', ' ').toLowerCase();
  }
}
