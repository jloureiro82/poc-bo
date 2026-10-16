import { findTaskPath, moveTask } from './task-moves';

const t = (label: string, extra: Record<string, unknown> = {}) => ({ label, ...extra });

describe('moveTask', () => {
  const doc = () => ({
    tasks: [
      t('a'),
      t('d', { type: 'decision', cases: [{ key: 'x', tasks: [t('x1'), t('x2')] }, { key: 'y', tasks: [] }], default: {} }),
      t('b'),
      t('p', { type: 'parallel', tasks: [t('p1')] }),
    ],
  });
  const labels = (list: { label: string }[]) => list.map(i => i.label).join(',');

  it('reorders within a list in both directions', () => {
    expect(labels(moveTask(doc(), ['tasks', 0], ['tasks'], 3)!.doc.tasks)).toBe('d,b,a,p');
    expect(labels(moveTask(doc(), ['tasks', 2], ['tasks'], 0)!.doc.tasks)).toBe('b,a,d,p');
    expect(labels(moveTask(doc(), ['tasks', 0], ['tasks'], 99)!.doc.tasks)).toBe('d,b,p,a');
  });

  it('moves between branches, including into a later sibling whose path shifts', () => {
    const r = moveTask(doc(), ['tasks', 0], ['tasks', 3, 'tasks'], 0)!;
    expect(labels(r.doc.tasks)).toBe('d,b,p');
    expect(labels((r.doc.tasks[2] as any).tasks)).toBe('a,p1');
    expect(findTaskPath(r.doc, r.moved)).toEqual(['tasks', 2, 'tasks', 0]);
  });

  it('moves out of a case and into an empty case or a missing default list', () => {
    const out = moveTask(doc(), ['tasks', 1, 'cases', 0, 'tasks', 1], ['tasks'], 0)!;
    expect(labels(out.doc.tasks)).toBe('x2,a,d,b,p');
    const intoEmpty = moveTask(doc(), ['tasks', 1, 'cases', 0, 'tasks', 0], ['tasks', 1, 'cases', 1, 'tasks'], 0)!;
    expect(labels((intoEmpty.doc.tasks[1] as any).cases[1].tasks)).toBe('x1');
    const intoDefault = moveTask(doc(), ['tasks', 0], ['tasks', 0, 'default', 'tasks'], 0);
    expect(intoDefault).toBeNull(); // 'a' has no default; only the decision does
    const ok = moveTask(doc(), ['tasks', 2], ['tasks', 1, 'default', 'tasks'], 0)!;
    expect(labels((ok.doc.tasks[1] as any).default.tasks)).toBe('b');
  });

  it('refuses to move a task into itself', () => {
    expect(moveTask(doc(), ['tasks', 3], ['tasks', 3, 'tasks'], 0)).toBeNull();
  });

  it('does not touch the original document', () => {
    const original = doc();
    moveTask(original, ['tasks', 0], ['tasks'], 3);
    expect(labels(original.tasks)).toBe('a,d,b,p');
  });

  it('creates a missing decision default when dropping onto its "no match" path', () => {
    const doc = { tasks: [t('a'), t('d', { type: 'decision', cases: [{ key: 1, tasks: [] }] })] };
    const r = moveTask(doc, ['tasks', 0], ['tasks', 1, 'default', 'tasks'], 0)!;
    expect((r.doc.tasks[0] as any).default.tasks.map((x: any) => x.label)).toEqual(['a']);
  });
});
