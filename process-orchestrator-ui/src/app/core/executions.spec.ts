import { ActivityRun, FlowTrace, StepTrace, WorkflowRun, buildRunOverlay, compareActivityRuns, formatDuration, runStatusOf, summarizeFlows } from './executions';

const step = (id: number, stepName: string, stepStatus: string): StepTrace =>
  ({ id, stepName, stepStatus, orchestratorId: 'o', stepId: `s${id}` }) as StepTrace;
const run = (id: number, stepName: string, activity: string, extra: Partial<ActivityRun> = {}): ActivityRun =>
  ({ id, stepName, activity, type: 'manual', activityId: `w${id}`, result: null, endDate: '2026-01-01T00:00:01Z', ...extra }) as ActivityRun;

// Mirrors the failureMultiStepFlow / failureLegacyCancelFlow runs recorded in the service.
const config = {
  label: 'f',
  stepList: [
    { label: 'intake', activityList: [{ label: 'validate', workflowLabel: 'wf' }] },
    {
      label: 'commit',
      previousStep: ['intake'],
      activityList: [
        { label: 'prepare', workflowLabel: 'wf' },
        { label: 'commit', previousActivity: ['prepare'], workflowLabel: 'wf', cancellationActivity: { active: true, label: 'undo' } },
        { label: 'never', previousActivity: ['commit'], workflowLabel: 'wf' },
      ],
    },
  ],
};

describe('buildRunOverlay', () => {
  it('marks steps and activities, counts retries and uses the workflow status', () => {
    const workflows = new Map<string, WorkflowRun>([
      ['w3', { workflowId: 'w3', status: 'FAILED' } as WorkflowRun],
      ['w4', { workflowId: 'w4', status: 'COMPLETED' } as WorkflowRun],
    ]);
    const { nodes, unmatched } = buildRunOverlay(
      config,
      [step(1, 'intake', 'COMPLETED'), step(2, 'commit', 'COMPLETED')],
      [run(1, 'intake', 'validate'), run(2, 'commit', 'prepare'), run(3, 'commit', 'commit', { result: 'NOK' }), run(4, 'commit', 'commit')],
      workflows,
    );
    expect(nodes.get('stepList[0]')?.status).toBe('ok');
    expect(nodes.get('stepList[1].activityList[0]')?.status).toBe('ok');
    const commit = nodes.get('stepList[1].activityList[1]')!;
    expect(commit.status).toBe('ok'); // failed first, then succeeded on the rerun
    expect(commit.attempts).toBe(2);
    expect(commit.detail).toContain('attempt 2');
    expect(nodes.has('stepList[1].activityList[2]')).toBe(false); // never ran
    expect(unmatched).toHaveLength(0);
  });

  it('attaches cancellation runs to the activity that declares them', () => {
    const { nodes } = buildRunOverlay(
      config,
      [step(1, 'commit', 'CANCELLED')],
      [run(1, 'commit', 'commit', { result: 'NOK' }), run(2, 'commit', 'undo', { type: 'cancellation', result: 'OK' })],
      new Map(),
    );
    expect(nodes.get('stepList[0]')).toBeUndefined();
    expect(nodes.get('stepList[1]')?.status).toBe('cancelled');
    const commit = nodes.get('stepList[1].activityList[1]')!;
    expect(commit.status).toBe('failed');
    expect(commit.cancelled).toBe(true);
    expect(commit.detail).toContain('cancellation "undo" ran');
  });

  it('reports runs that the current configuration no longer has', () => {
    const { unmatched } = buildRunOverlay(config, [], [run(1, 'gone', 'x'), run(2, 'intake', 'renamed')], new Map());
    expect(unmatched.map(r => r.activity)).toEqual(['x', 'renamed']);
  });
});

describe('formatting', () => {
  it('maps service statuses', () => {
    expect(['COMPLETED', 'FAILED', 'CANCELLED', 'ON_HOLD', 'IN_PROGRESS', 'NOK', 'OK'].map(runStatusOf)).toEqual([
      'ok', 'failed', 'cancelled', 'held', 'running', 'failed', 'ok',
    ]);
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(42)).toBe('42 ms');
    expect(formatDuration(1706)).toBe('1.71 s');
    expect(formatDuration(75_000)).toBe('1 min 15 s');
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2 h 5 min');
  });
});

const flowTrace = (id: number, flowStatus: string, seconds: number | null): FlowTrace =>
  ({
    id,
    orchestratorId: `o${id}`,
    flowName: 'f',
    flowStatus,
    startDate: '2026-01-01T00:00:00Z',
    endDate: seconds == null ? null : new Date(Date.parse('2026-01-01T00:00:00Z') + seconds * 1000).toISOString(),
  }) as FlowTrace;

describe('summarizeFlows', () => {
  it('counts statuses and durations, and groups failed activities and errors by flow', () => {
    const flows = [flowTrace(1, 'COMPLETED', 2), flowTrace(2, 'FAILED', 4), flowTrace(3, 'ON_HOLD', null), flowTrace(4, 'FAILED', 6)];
    const runs = [
      run(10, 'commit', 'prepare', { orchestratorId: 'o2', activityId: 'w10' }),
      run(11, 'commit', 'prepare', { orchestratorId: 'o2', activityId: 'w11' }),
      run(12, 'commit', 'prepare', { orchestratorId: 'o4', activityId: 'w12' }),
      run(13, 'intake', 'validate', { orchestratorId: 'o3', result: 'NOK', responseMessage: 'bad input' }),
      run(14, 'intake', 'validate', { orchestratorId: 'o1' }),
      run(15, 'other', 'x', { orchestratorId: 'not-in-the-set', result: 'NOK' }),
    ];
    const failed = (id: string, message: string) => ({ workflowId: id, status: 'FAILED', error: [{ message }] }) as WorkflowRun;
    const workflows = new Map([
      ['w10', failed('w10', 'timeout')],
      ['w11', failed('w11', 'timeout')],
      ['w12', failed('w12', 'timeout')],
    ]);
    const s = summarizeFlows(flows, runs, workflows);
    expect(s.total).toBe(4);
    expect(s.byStatus).toEqual({ ok: 1, failed: 2, cancelled: 0, running: 0, held: 1 });
    expect([s.median, s.p95]).toEqual([4000, 6000]);
    expect(s.failedActivities).toEqual([
      { label: 'commit / prepare', runs: 2, lastOrchestratorId: 'o4' },
      { label: 'intake / validate', runs: 1, lastOrchestratorId: 'o3' },
    ]);
    expect(s.errors).toEqual([
      { message: 'timeout', runs: 2, lastOrchestratorId: 'o4' },
      { message: 'bad input', runs: 1, lastOrchestratorId: 'o3' },
    ]);
  });
});

describe('compareActivityRuns', () => {
  it('lines up activities and flags different outcomes and retries', () => {
    const a = [run(1, 'intake', 'validate'), run(2, 'commit', 'prepare', { activityId: 'wa' })];
    const b = [run(5, 'intake', 'validate'), run(6, 'commit', 'prepare'), run(7, 'commit', 'prepare'), run(8, 'commit', 'undo', { type: 'cancellation', result: 'OK' })];
    const rows = compareActivityRuns(a, new Map([['wa', { workflowId: 'wa', status: 'FAILED' } as WorkflowRun]]), b, new Map());
    expect(rows.map(r => [r.label, r.a?.status ?? null, r.b?.status ?? null, r.b?.attempts ?? 0, r.differs])).toEqual([
      ['intake / validate', 'COMPLETED', 'COMPLETED', 1, false],
      ['commit / prepare', 'FAILED', 'COMPLETED', 2, true],
      ['commit / undo (cancellation)', null, 'COMPLETED', 1, true],
    ]);
  });
});
