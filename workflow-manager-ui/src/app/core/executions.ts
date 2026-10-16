import { isObject, pathToString } from './json-path';
import { childTaskLists } from './workflow-validator';

/**
 * Execution history as recorded by the service:
 *
 *   workflow execution (one run of a workflow, `workflowId`: status, inputs, outputs, errors, and the definition
 *   it ran)
 *     └ task executions (same `workflowId`: label, status, timing)
 */

export interface RunError {
  message?: string;
  stackTrace?: string[];
  taskContext?: Record<string, unknown>;
}

export interface WorkflowRun {
  id: number;
  workflowId: string;
  /** The workflow's name (stored in the `label` column of the execution table). */
  name: string;
  status: string;
  createTime: string | null;
  startTime: string | null;
  endTime: string | null;
  transactionId: string | null;
  messengerProvider: string | null;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  error: RunError[];
  /** Task label -> that task's last execution, with its output (the engine's `execution` map). */
  execution: Record<string, unknown> | null;
  /** The definition this run used, as the engine copied it when the run was created. */
  workflowDefinition: Record<string, unknown> | null;
}

export interface TaskRun {
  id: number;
  taskId: string;
  label: string;
  parentId: string | null;
  workflowId: string;
  status: string;
  progress: number | null;
  createTime: string | null;
  startTime: string | null;
  endTime: string | null;
  taskNumber: number | null;
  /** The task as the engine last saved it (the `executionTrace` column): its evaluated fields, output and error. */
  trace: Record<string, unknown> | null;
}

/**
 * Task executions in the order they started. The service saves them asynchronously, so their ids are not in
 * execution order.
 */
export function inRunOrder(tasks: TaskRun[]): TaskRun[] {
  const started = (t: TaskRun) => Date.parse(t.startTime ?? t.createTime ?? '') || 0;
  return [...tasks].sort((a, b) => started(a) - started(b) || a.id - b.id);
}

/** `WorkflowStatus`. */
export const WORKFLOW_STATUSES = ['COMPLETED', 'FAILED', 'REJECTED', 'STOPPED', 'STARTED', 'CREATED'] as const;

/** How a workflow or task fared: picks the colour classes. */
export type RunStatus = 'ok' | 'failed' | 'cancelled' | 'running' | 'held';

export interface NodeRun {
  status: RunStatus;
  /** How many executions were recorded for the task (loop iterations and retries show as more than one). */
  attempts: number;
  detail: string;
}

/** Maps a `WorkflowStatus` / `TaskStatus` to the diagram's colour classes. */
export function runStatusOf(status: string | null | undefined): RunStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'ok';
    case 'FAILED':
      return 'failed';
    case 'REJECTED':
    case 'CANCELLED':
    case 'SKIPPED':
    case 'NOT_ACTIVE':
      return 'cancelled';
    case 'STOPPED':
      return 'held';
    default:
      return 'running';
  }
}

/**
 * Reads a workflow execution from either endpoint shape: the entity resource (`/api/workflows`) returns the JSON
 * columns as text and the workflow name as `label`; the engine view (`/api/v1/execution/workflow…`) returns them
 * parsed, with `name`, `execution` and `error`.
 */
export function toWorkflowRun(raw: unknown): WorkflowRun {
  const r = isObject(raw) ? raw : {};
  const errors = parseJson(r['error'] ?? r['errorList']);
  return {
    id: Number(r['id'] ?? 0),
    workflowId: text(r['workflowId']) ?? '',
    name: text(r['label']) ?? text(r['name']) ?? '?',
    status: text(r['status']) ?? '',
    createTime: text(r['createTime']),
    startTime: text(r['startTime']),
    endTime: text(r['endTime']),
    transactionId: text(r['transactionId']),
    messengerProvider: text(r['messengerProvider']),
    inputs: asObject(parseJson(r['inputs'])),
    outputs: asObject(parseJson(r['outputs'])),
    error: Array.isArray(errors) ? errors.filter(isObject).map(e => e as RunError) : [],
    execution: asObject(parseJson(r['executionTrace'] ?? r['execution'])),
    workflowDefinition: asObject(parseJson(r['workflowDefinition'])),
  };
}

export function toTaskRun(raw: unknown): TaskRun {
  const r = isObject(raw) ? raw : {};
  return {
    id: Number(r['id'] ?? 0),
    taskId: text(r['taskId']) ?? '',
    label: text(r['label']) ?? text(r['name']) ?? '(no label)',
    parentId: text(r['parentId']),
    workflowId: text(r['workflowId']) ?? '',
    status: text(r['status']) ?? '',
    progress: typeof r['progress'] === 'number' ? r['progress'] : null,
    createTime: text(r['createTime']),
    startTime: text(r['startTime']),
    endTime: text(r['endTime']),
    taskNumber: typeof r['taskNumber'] === 'number' ? r['taskNumber'] : null,
    trace: asObject(parseJson(r['executionTrace'])),
  };
}

/**
 * What a run kept for a task label: the engine's `execution` map holds the top-level tasks, and each of those holds
 * its own `execution` map for the tasks inside it (decision cases, loop bodies).
 */
export function findTaskTrace(execution: unknown, label: string, depth = 0): Record<string, unknown> | null {
  if (!isObject(execution) || depth > 8) {
    return null;
  }
  const own = execution[label];
  if (isObject(own) && own['label'] === label) {
    return own;
  }
  for (const value of Object.values(execution)) {
    const nested = isObject(value) ? findTaskTrace(value['execution'], label, depth + 1) : null;
    if (nested) {
      return nested;
    }
  }
  return null;
}

/**
 * Overlays a run's task executions on the definition it ran: diagram node path -> what happened there.
 * Tasks are matched by label (the first task with that label, as the engine's own `execution` map does). Tasks that
 * never ran are absent. Executions whose label is not in the definition are returned separately.
 */
export function buildTaskOverlay(definition: unknown, tasks: TaskRun[]): { nodes: Map<string, NodeRun>; unmatched: TaskRun[] } {
  const nodes = new Map<string, NodeRun>();
  const unmatched: TaskRun[] = [];
  const pathByLabel = new Map<string, string>();
  const walk = (list: unknown, base: (string | number)[]) => {
    if (!Array.isArray(list)) {
      return;
    }
    list.forEach((task, i) => {
      if (!isObject(task)) {
        return;
      }
      const path = [...base, i];
      if (typeof task['label'] === 'string' && !pathByLabel.has(task['label'])) {
        pathByLabel.set(task['label'], pathToString(path));
      }
      for (const child of childTaskLists(task)) {
        let node: unknown = task;
        for (const part of child.path) {
          node = isObject(node) || Array.isArray(node) ? (node as Record<string | number, unknown>)[part] : undefined;
        }
        walk(node, [...path, ...child.path]);
      }
    });
  };
  walk(isObject(definition) ? definition['tasks'] : null, ['tasks']);

  for (const task of inRunOrder(tasks)) {
    const path = pathByLabel.get(task.label);
    if (path === undefined) {
      unmatched.push(task);
      continue;
    }
    const attempts = (nodes.get(path)?.attempts ?? 0) + 1;
    nodes.set(path, {
      status: runStatusOf(task.status),
      attempts,
      detail: `${task.status.toLowerCase().replace('_', ' ')}${attempts > 1 ? ` (ran ${attempts} times)` : ''}`,
    });
  }
  return { nodes, unmatched };
}

// ---- many runs ---------------------------------------------------------------------------------------------------

export interface RunSummary {
  total: number;
  byStatus: Record<RunStatus, number>;
  /** Median and 95th percentile duration of the runs that ended, in ms. */
  median: number | null;
  p95: number | null;
  /** Tasks that failed, with the number of runs they failed in, most first. */
  failedTasks: { label: string; runs: number; lastWorkflowId: string }[];
  /** The first error message of each failed or rejected run, grouped. */
  errors: { message: string; runs: number; lastWorkflowId: string }[];
}

/**
 * Health of a set of runs (the latest runs of one workflow). `failedTaskRuns` are the FAILED task executions of
 * those runs; a task that failed several times in one run (retries, loops) counts once for that run.
 */
export function summarizeRuns(runs: WorkflowRun[], failedTaskRuns: TaskRun[]): RunSummary {
  const byStatus: Record<RunStatus, number> = { ok: 0, failed: 0, cancelled: 0, running: 0, held: 0 };
  const durations: number[] = [];
  const errors = new Map<string, { runs: number; lastWorkflowId: string; lastId: number }>();
  for (const run of runs) {
    const status = runStatusOf(run.status);
    byStatus[status]++;
    const ms = run.endTime ? durationMs(run.startTime ?? run.createTime, run.endTime) : null;
    if (ms != null && !Number.isNaN(ms)) {
      durations.push(ms);
    }
    const message = run.error.find(e => e.message)?.message;
    if (message && (status === 'failed' || status === 'cancelled')) {
      const entry = errors.get(message) ?? { runs: 0, lastWorkflowId: run.workflowId, lastId: -1 };
      entry.runs++;
      if (run.id > entry.lastId) {
        entry.lastId = run.id;
        entry.lastWorkflowId = run.workflowId;
      }
      errors.set(message, entry);
    }
  }
  const latest = new Map(runs.map(r => [r.workflowId, r.id]));
  const tasks = new Map<string, { runIds: Set<string>; lastWorkflowId: string; lastId: number }>();
  for (const t of failedTaskRuns) {
    const entry = tasks.get(t.label) ?? { runIds: new Set<string>(), lastWorkflowId: t.workflowId, lastId: -1 };
    entry.runIds.add(t.workflowId);
    const runId = latest.get(t.workflowId) ?? -1;
    if (runId > entry.lastId) {
      entry.lastId = runId;
      entry.lastWorkflowId = t.workflowId;
    }
    tasks.set(t.label, entry);
  }
  durations.sort((a, b) => a - b);
  const pct = (p: number) => (durations.length ? durations[Math.min(durations.length - 1, Math.ceil(p * durations.length) - 1)] : null);
  return {
    total: runs.length,
    byStatus,
    median: pct(0.5),
    p95: pct(0.95),
    failedTasks: [...tasks]
      .map(([label, e]) => ({ label, runs: e.runIds.size, lastWorkflowId: e.lastWorkflowId }))
      .sort((a, b) => b.runs - a.runs || a.label.localeCompare(b.label)),
    errors: [...errors]
      .map(([message, e]) => ({ message, runs: e.runs, lastWorkflowId: e.lastWorkflowId }))
      .sort((a, b) => b.runs - a.runs),
  };
}

export interface TaskSide {
  status: string;
  attempts: number;
  durationMs: number | null;
}

export interface TaskComparison {
  label: string;
  a: TaskSide | null;
  b: TaskSide | null;
  /** The outcome or the number of executions differs. */
  differs: boolean;
}

/** Two runs task by task: each label once, in the order the tasks first ran in either run. */
export function compareTaskRuns(a: TaskRun[], b: TaskRun[]): TaskComparison[] {
  const side = (tasks: TaskRun[]) => {
    const out = new Map<string, TaskSide>();
    for (const t of inRunOrder(tasks)) {
      const prev = out.get(t.label);
      const ms = durationMs(t.startTime ?? t.createTime, t.endTime);
      out.set(t.label, {
        status: t.status,
        attempts: (prev?.attempts ?? 0) + 1,
        durationMs: ms == null || Number.isNaN(ms) ? (prev?.durationMs ?? null) : (prev?.durationMs ?? 0) + ms,
      });
    }
    return out;
  };
  const left = side(a);
  const right = side(b);
  const labels = [...new Set([...left.keys(), ...right.keys()])];
  return labels.map(label => {
    const x = left.get(label) ?? null;
    const y = right.get(label) ?? null;
    return { label, a: x, b: y, differs: !x || !y || runStatusOf(x.status) !== runStatusOf(y.status) || x.attempts !== y.attempts };
  });
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value ?? null;
  }
  try {
    return value.trim() ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

// ---- formatting --------------------------------------------------------------------------------------------------

export function durationMs(start: string | null, end: string | null, now = Date.now()): number | null {
  if (!start) {
    return null;
  }
  return (end ? Date.parse(end) : now) - Date.parse(start);
}

export function formatDuration(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) {
    return '—';
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  }
  if (ms < 3_600_000) {
    return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
  }
  const h = Math.floor(ms / 3_600_000);
  return h < 48 ? `${h} h ${Math.round((ms % 3_600_000) / 60_000)} min` : `${Math.round(h / 24)} days`;
}
