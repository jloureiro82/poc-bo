import { labelsIn, parseTasks, prepareForPaste, renameReferences } from './task-clipboard';

const logical = (label: string, expression = '${true}') => ({ label, type: 'simple', component: 'logical', expression });

describe('labelsIn', () => {
  it('collects nested labels', () => {
    const tasks = [{ label: 'd', type: 'decision', cases: [{ key: 1, tasks: [logical('a')] }] }, { label: 'l', type: 'for', list: '${workflow.items}', tasks: [logical('b')] }];
    expect([...labelsIn(tasks)]).toEqual(['d', 'a', 'l', 'b']);
  });
});

describe('parseTasks', () => {
  it('accepts one task or a list of tasks', () => {
    expect(parseTasks(JSON.stringify(logical('a')))).toEqual([logical('a')]);
    expect(parseTasks(JSON.stringify([logical('a'), logical('b')]))).toHaveLength(2);
  });

  it('refuses text, a workflow and lists of other things', () => {
    expect(parseTasks('hello')).toBeNull();
    expect(parseTasks(JSON.stringify({ name: 'w', tasks: [] }))).toBeNull();
    expect(parseTasks('[1, 2]')).toBeNull();
    expect(parseTasks('[]')).toBeNull();
  });
});

describe('prepareForPaste', () => {
  it('keeps free labels and renames taken ones', () => {
    const { tasks, renamed } = prepareForPaste([logical('a'), logical('b')], new Set(['a', 'aCopy']));
    expect(tasks.map(t => t.label)).toEqual(['aCopy2', 'b']);
    expect([...renamed]).toEqual([['a', 'aCopy2']]);
  });

  it('renames nested tasks and the references to them inside the copy', () => {
    const loop = { label: 'l', type: 'for', list: '${workflow.items}', expression: "${execution.step.output['done'] == execution['step'].x}", tasks: [logical('step')] };
    const { tasks } = prepareForPaste([loop], new Set(['l', 'step']));
    expect(tasks[0].label).toBe('lCopy');
    expect(tasks[0].tasks![0].label).toBe('stepCopy');
    expect(tasks[0].expression).toBe("${execution.stepCopy.output['done'] == execution['stepCopy'].x}");
  });

  it('does not change the tasks it was given', () => {
    const original = [logical('a')];
    prepareForPaste(original, new Set(['a']));
    expect(original[0].label).toBe('a');
  });
});

describe('renameReferences', () => {
  it('only rewrites whole labels', () => {
    const out = renameReferences({ e: '${execution.ab.x} ${execution.a.y} ${execution.a}' }, new Map([['a', 'z']]));
    expect(out).toEqual({ e: '${execution.ab.x} ${execution.z.y} ${execution.z}' });
  });
});
