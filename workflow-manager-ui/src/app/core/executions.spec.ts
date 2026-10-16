import { TaskRun, buildTaskOverlay, compareTaskRuns, findTaskTrace, formatDuration, inRunOrder, runStatusOf, summarizeRuns, toTaskRun, toWorkflowRun } from './executions';

const task = (id: number, label: string, status = 'COMPLETED'): TaskRun => toTaskRun({ id, label, status, workflowId: 'w', taskId: `t${id}` });

const definition = {
  name: 'f',
  tasks: [
    { label: 'check', type: 'simple', component: 'logical', expression: '${true}' },
    {
      label: 'route',
      type: 'decision',
      expression: '${x}',
      cases: [{ key: 'a', tasks: [{ label: 'onA', type: 'simple', component: 'print' }] }],
      default: { tasks: [{ label: 'fallback', type: 'simple', component: 'print' }] },
    },
    { label: 'each', type: 'for', list: '${items}', tasks: [{ label: 'item', type: 'simple', component: 'print' }] },
    { label: 'never', type: 'simple', component: 'print' },
  ],
};

describe('buildTaskOverlay', () => {
  it('places task executions on the definition, also inside cases and loops', () => {
    const { nodes, unmatched } = buildTaskOverlay(definition, [
      task(1, 'check'),
      task(2, 'route'),
      task(3, 'onA'),
      task(4, 'each', 'FAILED'),
      task(5, 'item'),
      task(6, 'item', 'FAILED'),
    ]);
    expect(nodes.get('tasks[0]')?.status).toBe('ok');
    expect(nodes.get('tasks[1].cases[0].tasks[0]')?.status).toBe('ok');
    expect(nodes.has('tasks[1].default.tasks[0]')).toBe(false); // the other branch never ran
    expect(nodes.get('tasks[2]')?.status).toBe('failed');
    const item = nodes.get('tasks[2].tasks[0]')!;
    expect(item.status).toBe('failed'); // the last execution decides
    expect(item.attempts).toBe(2);
    expect(item.detail).toBe('failed (ran 2 times)');
    expect(nodes.has('tasks[3]')).toBe(false);
    expect(unmatched).toHaveLength(0);
  });

  it('orders executions by start time, because ids follow the save order', () => {
    const at = (id: number, label: string, status: string, startTime: string) => ({ ...task(id, label, status), startTime });
    const { nodes } = buildTaskOverlay(definition, [
      at(9, 'item', 'COMPLETED', '2026-01-01T00:00:02Z'),
      at(3, 'item', 'FAILED', '2026-01-01T00:00:05Z'),
    ]);
    expect(nodes.get('tasks[2].tasks[0]')?.status).toBe('failed');
    expect(inRunOrder([at(9, 'a', 'x', '2026-01-01T00:00:02Z'), at(3, 'b', 'x', '2026-01-01T00:00:05Z')]).map(t => t.id)).toEqual([9, 3]);
  });

  it('reports executions whose task is not in the definition', () => {
    const { unmatched } = buildTaskOverlay(definition, [task(1, 'gone'), task(2, 'check')]);
    expect(unmatched.map(t => t.label)).toEqual(['gone']);
    expect(buildTaskOverlay(null, [task(1, 'check')]).unmatched).toHaveLength(1);
  });
});

describe('toWorkflowRun', () => {
  it('reads the stored row: JSON columns as text, the workflow name in label', () => {
    const run = toWorkflowRun({
      id: 7,
      workflowId: 'abc',
      label: 'accountDisable',
      status: 'FAILED',
      startTime: '2026-01-01T00:00:00Z',
      endTime: null,
      inputs: '{"workflow":{"email":"a@b.c"}}',
      outputs: '',
      error: '[{"message":"boom","taskContext":{"label":"login"}}]',
      executionTrace: '{"login":{"status":"FAILED"}}',
      workflowDefinition: '{"name":"accountDisable","version":3,"tasks":[]}',
    });
    expect(run.name).toBe('accountDisable');
    expect(run.inputs).toEqual({ workflow: { email: 'a@b.c' } });
    expect(run.outputs).toBeNull();
    expect(run.error[0].taskContext?.['label']).toBe('login');
    expect(run.execution).toEqual({ login: { status: 'FAILED' } });
    expect(run.workflowDefinition?.['version']).toBe(3);
  });

  it('reads the engine view too, and survives broken JSON', () => {
    const run = toWorkflowRun({ id: 1, workflowId: 'x', name: 'wf', status: 'COMPLETED', execution: { a: 1 }, error: 'null', inputs: '{oops' });
    expect(run.name).toBe('wf');
    expect(run.execution).toEqual({ a: 1 });
    expect(run.error).toEqual([]);
    expect(run.inputs).toBeNull();
  });
});

describe('findTaskTrace', () => {
  // The shape of `execution` in GET /api/v1/execution/workflow/workflowid/{id}.
  const execution = {
    check: { label: 'check', status: 'COMPLETED' },
    each: { label: 'each', status: 'COMPLETED', execution: { forPosition: 1, item: { label: 'item', status: 'COMPLETED', output: 1 } } },
  };

  it('finds top-level tasks and tasks inside loops and cases', () => {
    expect(findTaskTrace(execution, 'check')?.['status']).toBe('COMPLETED');
    expect(findTaskTrace(execution, 'item')?.['output']).toBe(1);
    expect(findTaskTrace(execution, 'gone')).toBeNull();
    expect(findTaskTrace(null, 'check')).toBeNull();
  });
});

describe('formatting', () => {
  it('maps service statuses', () => {
    expect(['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED', 'SKIPPED', 'STOPPED', 'STARTED', 'CREATED'].map(runStatusOf)).toEqual([
      'ok', 'failed', 'cancelled', 'cancelled', 'cancelled', 'held', 'running', 'running',
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

describe('summarizeRuns', () => {
  const run = (id: number, status: string, ms: number | null, message?: string) =>
    toWorkflowRun({
      id,
      workflowId: `w${id}`,
      name: 'f',
      status,
      startTime: '2026-10-01T10:00:00.000Z',
      endTime: ms == null ? null : new Date(Date.parse('2026-10-01T10:00:00.000Z') + ms).toISOString(),
      error: message ? [{ message }] : [],
    });
  const failed = (id: number, label: string, workflowId: string) => toTaskRun({ id, label, status: 'FAILED', workflowId });

  it('counts outcomes and durations', () => {
    const s = summarizeRuns([run(1, 'COMPLETED', 100), run(2, 'COMPLETED', 300), run(3, 'FAILED', 200), run(4, 'STARTED', null)], []);
    expect(s.total).toBe(4);
    expect(s.byStatus).toEqual({ ok: 2, failed: 1, cancelled: 0, running: 1, held: 0 });
    expect(s.median).toBe(200);
    expect(s.p95).toBe(300);
  });

  it('counts a failing task once per run, most failing first, linking its latest run', () => {
    const s = summarizeRuns(
      [run(1, 'FAILED', 1), run(2, 'FAILED', 1), run(3, 'FAILED', 1)],
      [failed(1, 'a', 'w1'), failed(2, 'a', 'w1'), failed(3, 'b', 'w1'), failed(4, 'b', 'w2'), failed(5, 'b', 'w3'), failed(6, 'a', 'w2')],
    );
    expect(s.failedTasks).toEqual([
      { label: 'b', runs: 3, lastWorkflowId: 'w3' },
      { label: 'a', runs: 2, lastWorkflowId: 'w2' },
    ]);
  });

  it('groups the errors of failed runs by message', () => {
    const s = summarizeRuns([run(1, 'FAILED', 1, 'boom'), run(2, 'FAILED', 1, 'boom'), run(3, 'FAILED', 1, 'other'), run(4, 'COMPLETED', 1, 'boom')], []);
    expect(s.errors).toEqual([
      { message: 'boom', runs: 2, lastWorkflowId: 'w2' },
      { message: 'other', runs: 1, lastWorkflowId: 'w3' },
    ]);
  });

  it('handles no runs', () => {
    expect(summarizeRuns([], []).median).toBeNull();
  });
});

describe('compareTaskRuns', () => {
  const at = (id: number, label: string, status: string, start: number, end: number) =>
    toTaskRun({ id, label, status, workflowId: 'w', startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() });

  it('lines tasks up by label and marks the differences', () => {
    const rows = compareTaskRuns(
      [at(1, 'a', 'COMPLETED', 0, 10), at(2, 'b', 'COMPLETED', 10, 20), at(3, 'b', 'COMPLETED', 20, 25)],
      [at(4, 'a', 'COMPLETED', 0, 30), at(5, 'b', 'FAILED', 30, 40), at(6, 'c', 'COMPLETED', 40, 50)],
    );
    expect(rows.map(r => [r.label, r.differs])).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
    ]);
    expect(rows[1].a).toEqual({ status: 'COMPLETED', attempts: 2, durationMs: 15 });
    expect(rows[2].a).toBeNull();
  });
});
