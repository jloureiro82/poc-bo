import { diffOrchestrators, diffValues, diffWorkflows, preview } from './diff';

const logical = (label: string, expression = '${true}') => ({ label, type: 'simple', component: 'logical', expression });
const doc = (tasks: unknown[], extra: Record<string, unknown> = {}) => ({ label: 'w', messengerProvider: 'sync', tasks, ...extra });
const activity = (label: string, extra: Record<string, unknown> = {}) => ({ label, workflowLabel: 'wf', ...extra });
const flow = (stepList: unknown[]) => ({ label: 'o', stepList });

describe('diffValues', () => {
  it('reports leaf changes of objects, and arrays as a whole', () => {
    expect(diffValues({ a: 1, b: { c: 2, d: [1] } }, { a: 1, b: { c: 3, d: [1, 2] }, e: true })).toEqual([
      { path: 'b.c', kind: 'changed', before: 2, after: 3 },
      { path: 'b.d', kind: 'changed', before: [1], after: [1, 2] },
      { path: 'e', kind: 'added', after: true },
    ]);
  });

  it('ignores key order', () => {
    expect(diffValues({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });
});

describe('diffWorkflows', () => {
  it('treats null as absent', () => {
    expect(diffWorkflows({ ...doc([logical('a')]), outputParameters: null }, doc([logical('a')])).identical).toBe(true);
  });

  it('reports workflow fields', () => {
    const d = diffWorkflows(doc([]), doc([], { messengerProvider: 'jms', description: 'x' }));
    expect(d.fields.map(f => `${f.kind} ${f.path}`)).toEqual(['changed messengerProvider', 'added description']);
  });

  it('matches tasks by label: added, removed and changed', () => {
    const d = diffWorkflows(doc([logical('a'), logical('b')]), doc([logical('a', '${false}'), logical('c')]));
    expect(d.nodes.map(t => `${t.kind} ${t.noun} ${t.label}`)).toEqual(['changed task a', 'added task c', 'removed task b']);
    expect(d.nodes[0].fields).toEqual([{ path: 'expression', kind: 'changed', before: '${true}', after: '${false}' }]);
  });

  it('does not mark the tasks after an insertion as moved', () => {
    const d = diffWorkflows(doc([logical('a'), logical('b'), logical('c')]), doc([logical('x'), logical('a'), logical('b'), logical('c')]));
    expect(d.nodes.map(t => `${t.kind} ${t.label}`)).toEqual(['added x']);
  });

  it('reports a reordered task as moved', () => {
    const d = diffWorkflows(doc([logical('a'), logical('b'), logical('c')]), doc([logical('c'), logical('a'), logical('b')]));
    expect(d.nodes.map(t => `${t.kind} ${t.label}`)).toEqual(['moved c']);
  });

  it('reports a task moved into a case, without reporting the decision as changed', () => {
    const before = doc([{ label: 'd', type: 'decision', expression: '${1}', cases: [{ key: 1, tasks: [] }] }, logical('a')]);
    const after = doc([{ label: 'd', type: 'decision', expression: '${1}', cases: [{ key: 1, tasks: [logical('a')] }] }]);
    const d = diffWorkflows(before, after);
    expect(d.nodes).toHaveLength(1);
    expect(d.nodes[0]).toMatchObject({ kind: 'moved', label: 'a', from: 'tasks', where: 'd › case 1', path: 'tasks[0].cases[0].tasks[0]' });
  });
});

describe('diffOrchestrators', () => {
  it('finds nothing between equal configurations', () => {
    const steps = [{ label: 's1', activityList: [activity('a1')] }];
    expect(diffOrchestrators(flow(steps), structuredClone(flow(steps))).identical).toBe(true);
  });

  it('reports steps and activities separately', () => {
    const before = flow([{ label: 's1', activityList: [activity('a1'), activity('a2')] }]);
    const after = flow([
      { label: 's1', type: 'manual', activityList: [activity('a1', { workflowLabel: 'other' })] },
      { label: 's2', previousStep: ['s1'], activityList: [activity('b1')] },
    ]);
    const d = diffOrchestrators(before, after);
    expect(d.nodes.map(n => `${n.kind} ${n.noun} ${n.label}`)).toEqual([
      'changed step s1',
      'changed activity a1',
      'added step s2',
      'added activity b1',
      'removed activity a2',
    ]);
    expect(d.nodes[0].fields.map(f => f.path)).toEqual(['type']);
    expect(d.nodes[1]).toMatchObject({ where: 'step s1', path: 'stepList[0].activityList[0]' });
  });

  it('matches activities within their step, so equal labels in two steps stay apart', () => {
    const before = flow([{ label: 's1', activityList: [activity('a')] }, { label: 's2', activityList: [activity('a')] }]);
    const after = flow([{ label: 's1', activityList: [activity('a')] }, { label: 's2', activityList: [activity('a', { sync: true })] }]);
    expect(diffOrchestrators(before, after).nodes.map(n => `${n.kind} ${n.where}`)).toEqual(['changed step s2']);
  });

  it('reports a reordered step as moved', () => {
    const before = flow([{ label: 's1' }, { label: 's2' }]);
    const after = flow([{ label: 's2' }, { label: 's1' }]);
    expect(diffOrchestrators(before, after).nodes.map(n => `${n.kind} ${n.label}`)).toHaveLength(1);
  });
});

describe('preview', () => {
  it('shortens long values', () => {
    expect(preview('x'.repeat(100), 10)).toBe('"xxxxxxxx…');
    expect(preview(undefined)).toBe('—');
  });
});
