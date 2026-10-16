import { isObject, pathToString } from './json-path';

/**
 * Execution history as recorded by the service:
 *
 *   flow trace (one run of an orchestrator, `orchestratorId`)
 *     └ step traces (`stepName`, `stepStatus`)
 *     └ activity runs (orchestrator execution traces: `stepName` + `activity`, `type`, `result`)
 *         └ workflow execution (`workflowId` == the run's `activityId`: status, outputs, error)
 *             └ task executions (same `workflowId`: label, status, timing)
 */

export interface FlowTrace {
  id: number;
  orchestratorId: string;
  flowName: string;
  flowStatus: string;
  startDate: string | null;
  endDate: string | null;
  stepCount: number | null;
  currentStepId: string | null;
  internalVariables?: Record<string, unknown> | null;
}

export interface StepTrace {
  id: number;
  orchestratorId: string;
  stepId: string;
  stepName: string;
  stepSequence: number | null;
  currentActivity: string | null;
  stepStatus: string;
  startDate: string | null;
  endDate: string | null;
}

export interface ActivityRun {
  id: number;
  orchestratorId: string;
  stepId: string;
  activityId: string;
  flowName: string;
  stepName: string;
  activity: string;
  /** manual | automatic | cancellation */
  type: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  responseMessage: string | null;
  /** NOK on failure, OK for a completed cancellation, usually empty on success. */
  result: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface WorkflowRun {
  id: number;
  workflowId: string;
  label: string;
  status: string;
  createTime: string | null;
  startTime: string | null;
  endTime: string | null;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  error: { message?: string; stackTrace?: string[]; taskContext?: Record<string, unknown> }[] | null;
  executionTrace: Record<string, unknown> | null;
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
  executionTrace: Record<string, unknown> | null;
}

/** `RECOVERING`: a held flow a retry, rerun, skip, cancel or the hold timeout is acting on. */
export const FLOW_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'ON_HOLD', 'RECOVERING', 'IN_PROGRESS'] as const;

/** How a node of the diagram fared in one execution. */
export type RunStatus = 'ok' | 'failed' | 'cancelled' | 'running' | 'held';

export interface NodeRun {
  status: RunStatus;
  /** How many times it ran (retries / reruns show as more than one). */
  attempts: number;
  /** A cancellation workflow ran for it. */
  cancelled?: boolean;
  detail: string;
}

/** Maps a service status string to the diagram's colour classes. */
export function runStatusOf(status: string | null | undefined): RunStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
    case 'OK':
      return 'ok';
    case 'FAILED':
    case 'NOK':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'ON_HOLD':
      return 'held';
    default:
      return 'running';
  }
}

/** The outcome of one activity run: its workflow execution decides, else the trace's own result / end date. */
export function activityRunStatus(run: ActivityRun, workflows: Map<string, WorkflowRun>): RunStatus {
  const wf = workflows.get(run.activityId);
  if (wf) {
    return runStatusOf(wf.status);
  }
  if (run.result === 'NOK') {
    return 'failed';
  }
  return run.endDate ? 'ok' : 'running';
}

/**
 * Overlays an execution on its orchestrator configuration: diagram node path -> what happened there.
 * Nodes that never ran are absent. Runs whose step/activity is not in the configuration are returned separately
 * (the configuration may have changed since the run).
 */
export function buildRunOverlay(
  config: unknown,
  steps: StepTrace[],
  runs: ActivityRun[],
  workflows: Map<string, WorkflowRun>,
): { nodes: Map<string, NodeRun>; unmatched: ActivityRun[] } {
  const nodes = new Map<string, NodeRun>();
  const unmatched: ActivityRun[] = [];
  const stepList = isObject(config) && Array.isArray(config['stepList']) ? (config['stepList'] as unknown[]) : [];
  const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;

  const stepIndex = new Map<string, number>();
  stepList.forEach((s, i) => isObject(s) && typeof s['label'] === 'string' && stepIndex.set(s['label'], i));

  for (const [label, si] of stepIndex) {
    const traces = steps.filter(s => s.stepName === label).sort(byId);
    if (traces.length) {
      const last = traces[traces.length - 1];
      nodes.set(pathToString(['stepList', si]), {
        status: runStatusOf(last.stepStatus),
        attempts: traces.length,
        detail: `${last.stepStatus}${traces.length > 1 ? ` (entered ${traces.length} times)` : ''}`,
      });
    }
  }

  const sorted = [...runs].sort(byId);
  for (const run of sorted) {
    const si = stepIndex.get(run.stepName);
    const step = si === undefined ? null : (stepList[si] as Record<string, unknown>);
    const activities = step && Array.isArray(step['activityList']) ? (step['activityList'] as Record<string, unknown>[]) : [];

    if (run.type === 'cancellation') {
      // Recorded under the cancellation workflow's name: attach it to the activity that declares it.
      const ai = activities.findIndex(a => isObject(a['cancellationActivity']) && a['cancellationActivity']['label'] === run.activity);
      if (si === undefined || ai < 0) {
        unmatched.push(run);
        continue;
      }
      const path = pathToString(['stepList', si, 'activityList', ai]);
      const current = nodes.get(path);
      nodes.set(path, {
        status: current?.status ?? 'failed',
        attempts: current?.attempts ?? 0,
        cancelled: true,
        detail: `${current?.detail ?? ''}${current ? ' · ' : ''}cancellation "${run.activity}" ${run.result === 'OK' ? 'ran' : 'failed'}`,
      });
      continue;
    }

    const ai = activities.findIndex(a => a['label'] === run.activity);
    if (si === undefined || ai < 0) {
      unmatched.push(run);
      continue;
    }
    const path = pathToString(['stepList', si, 'activityList', ai]);
    const current = nodes.get(path);
    const status = activityRunStatus(run, workflows);
    const attempts = (current?.attempts ?? 0) + 1;
    nodes.set(path, {
      status,
      attempts,
      cancelled: current?.cancelled,
      detail: `${status === 'ok' ? 'succeeded' : status}${attempts > 1 ? ` on attempt ${attempts}` : ''}`,
    });
  }
  return { nodes, unmatched };
}

// ---- many runs ---------------------------------------------------------------------------------------------------

/** The status text of one activity run: that of its workflow execution, else what the trace says. */
export function activityRunStatusText(run: ActivityRun, workflows: Map<string, WorkflowRun>): string {
  const wf = workflows.get(run.activityId);
  if (wf?.status) {
    return wf.status;
  }
  if (run.result === 'NOK') {
    return 'FAILED';
  }
  return run.endDate ? 'COMPLETED' : 'IN_PROGRESS';
}

/** How an activity run is named in summaries: `step / activity`, with cancellations marked. */
export function activityRunLabel(run: ActivityRun): string {
  return `${run.stepName} / ${run.activity}${run.type === 'cancellation' ? ' (cancellation)' : ''}`;
}

export interface FlowSummary {
  total: number;
  byStatus: Record<RunStatus, number>;
  /** Median and 95th percentile duration of the flows that ended, in ms. */
  median: number | null;
  p95: number | null;
  /** Activities that failed, with the number of flows they failed in, most first. */
  failedActivities: { label: string; runs: number; lastOrchestratorId: string }[];
  /** The first error of each failed activity run (its workflow's error, else the trace's message), grouped by flow. */
  errors: { message: string; runs: number; lastOrchestratorId: string }[];
}

/**
 * Health of a set of flows (the latest runs of one orchestrator). `runs` are their activity runs and `workflows` the
 * workflow executions known for them (the failed ones are enough). An activity that failed several times in one flow
 * (retries, reruns) counts once for that flow.
 */
export function summarizeFlows(flows: FlowTrace[], runs: ActivityRun[], workflows: Map<string, WorkflowRun>): FlowSummary {
  const byStatus: Record<RunStatus, number> = { ok: 0, failed: 0, cancelled: 0, running: 0, held: 0 };
  const durations: number[] = [];
  const flowId = new Map<string, number>();
  for (const flow of flows) {
    byStatus[runStatusOf(flow.flowStatus)]++;
    flowId.set(flow.orchestratorId, flow.id);
    const ms = flow.endDate ? durationMs(flow.startDate, flow.endDate) : null;
    if (ms != null && !Number.isNaN(ms)) {
      durations.push(ms);
    }
  }
  const group = () => new Map<string, { flows: Set<string>; last: string; lastId: number }>();
  const add = (map: ReturnType<typeof group>, key: string, orchestratorId: string) => {
    const entry = map.get(key) ?? { flows: new Set<string>(), last: orchestratorId, lastId: -1 };
    entry.flows.add(orchestratorId);
    const id = flowId.get(orchestratorId) ?? -1;
    if (id > entry.lastId) {
      entry.lastId = id;
      entry.last = orchestratorId;
    }
    map.set(key, entry);
  };
  const activities = group();
  const errors = group();
  for (const run of runs) {
    if (!flowId.has(run.orchestratorId) || runStatusOf(activityRunStatusText(run, workflows)) !== 'failed') {
      continue;
    }
    add(activities, activityRunLabel(run), run.orchestratorId);
    const message = workflows.get(run.activityId)?.error?.find(e => e.message)?.message ?? run.responseMessage;
    if (message) {
      add(errors, message, run.orchestratorId);
    }
  }
  durations.sort((a, b) => a - b);
  const pct = (p: number) => (durations.length ? durations[Math.min(durations.length - 1, Math.ceil(p * durations.length) - 1)] : null);
  const list = (map: ReturnType<typeof group>) =>
    [...map].map(([key, e]) => ({ key, runs: e.flows.size, lastOrchestratorId: e.last })).sort((a, b) => b.runs - a.runs || a.key.localeCompare(b.key));
  return {
    total: flows.length,
    byStatus,
    median: pct(0.5),
    p95: pct(0.95),
    failedActivities: list(activities).map(({ key, ...e }) => ({ label: key, ...e })),
    errors: list(errors).map(({ key, ...e }) => ({ message: key, ...e })),
  };
}

export interface RunSide {
  /** The service's status text (`COMPLETED`, `FAILED`, …). */
  status: string;
  attempts: number;
  durationMs: number | null;
}

export interface RunComparison {
  label: string;
  a: RunSide | null;
  b: RunSide | null;
  /** The outcome or the number of runs differs. */
  differs: boolean;
}

/** Two flows activity by activity (`step / activity`): each once, in the order they first ran in either flow. */
export function compareActivityRuns(
  a: ActivityRun[],
  aWorkflows: Map<string, WorkflowRun>,
  b: ActivityRun[],
  bWorkflows: Map<string, WorkflowRun>,
): RunComparison[] {
  const side = (runs: ActivityRun[], workflows: Map<string, WorkflowRun>) => {
    const out = new Map<string, RunSide>();
    for (const run of [...runs].sort((x, y) => x.id - y.id)) {
      const label = activityRunLabel(run);
      const prev = out.get(label);
      const ms = durationMs(run.startDate, run.endDate);
      out.set(label, {
        status: activityRunStatusText(run, workflows),
        attempts: (prev?.attempts ?? 0) + 1,
        durationMs: ms == null || Number.isNaN(ms) ? (prev?.durationMs ?? null) : (prev?.durationMs ?? 0) + ms,
      });
    }
    return out;
  };
  const left = side(a, aWorkflows);
  const right = side(b, bWorkflows);
  const labels = [...new Set([...left.keys(), ...right.keys()])];
  return labels.map(label => {
    const x = left.get(label) ?? null;
    const y = right.get(label) ?? null;
    return { label, a: x, b: y, differs: !x || !y || runStatusOf(x.status) !== runStatusOf(y.status) || x.attempts !== y.attempts };
  });
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
