import { diffValues, diffWorkflows, preview, unstoredKeys } from './diff';

const logical = (label: string, expression = '${true}') => ({ label, type: 'simple', component: 'logical', expression });
const doc = (tasks: unknown[], extra: Record<string, unknown> = {}) => ({ name: 'w', messengerProvider: 'sync', tasks, ...extra });

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
  it('finds nothing between a draft and its stored form', () => {
    const stored = { ...doc([logical('a')]), description: 'from details', version: 3, suppressFailureOutputErrorList: true, input: null };
    expect(diffWorkflows(stored, doc([logical('a')])).identical).toBe(true);
  });

  it('ignores keys the service does not store', () => {
    expect(diffWorkflows(doc([]), doc([], { restartable: true })).identical).toBe(true);
  });

  it('reports workflow fields', () => {
    const d = diffWorkflows(doc([]), doc([], { messengerProvider: 'jms', failureWorkflowId: 'f' }));
    expect(d.fields.map(f => `${f.kind} ${f.path}`)).toEqual(['changed messengerProvider', 'added failureWorkflowId']);
  });

  it('matches tasks by label: added, removed and changed', () => {
    const d = diffWorkflows(doc([logical('a'), logical('b')]), doc([logical('a', '${false}'), logical('c')]));
    expect(d.tasks.map(t => `${t.kind} ${t.label}`)).toEqual(['changed a', 'added c', 'removed b']);
    expect(d.tasks[0].fields).toEqual([{ path: 'expression', kind: 'changed', before: '${true}', after: '${false}' }]);
  });

  it('does not mark the tasks after an insertion as moved', () => {
    const d = diffWorkflows(doc([logical('a'), logical('b'), logical('c')]), doc([logical('x'), logical('a'), logical('b'), logical('c')]));
    expect(d.tasks.map(t => `${t.kind} ${t.label}`)).toEqual(['added x']);
  });

  it('reports a reordered task as moved', () => {
    const d = diffWorkflows(doc([logical('a'), logical('b'), logical('c')]), doc([logical('c'), logical('a'), logical('b')]));
    expect(d.tasks.map(t => `${t.kind} ${t.label}`)).toEqual(['moved c']);
  });

  it('reports a task moved into a case, without reporting the decision as changed', () => {
    const before = doc([{ label: 'd', type: 'decision', expression: '${1}', cases: [{ key: 1, tasks: [] }] }, logical('a')]);
    const after = doc([{ label: 'd', type: 'decision', expression: '${1}', cases: [{ key: 1, tasks: [logical('a')] }] }]);
    const d = diffWorkflows(before, after);
    expect(d.tasks).toHaveLength(1);
    expect(d.tasks[0]).toMatchObject({ kind: 'moved', label: 'a', from: 'tasks', where: 'd › case 1', path: 'tasks[0].cases[0].tasks[0]' });
  });
});

describe('unstoredKeys / preview', () => {
  it('lists top-level keys the create endpoint drops', () => {
    expect(unstoredKeys({ name: 'w', description: 'd', restartable: true, foo: 1 })).toEqual(['restartable', 'foo']);
  });

  it('shortens long values', () => {
    expect(preview('x'.repeat(100), 10)).toBe('"xxxxxxxx…');
    expect(preview(undefined)).toBe('—');
  });
});
