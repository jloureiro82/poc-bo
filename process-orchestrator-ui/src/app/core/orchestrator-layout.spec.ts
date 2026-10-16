import { analyzeDag } from './dag';
import { getAt, parsePath, pathToString, setAt } from './json-path';
import { layoutOrchestrator } from './orchestrator-layout';
import { sampleOrchestrator } from './samples';

describe('analyzeDag', () => {
  it('finds entries, depth, cycles and unreachable nodes', () => {
    const dag = analyzeDag([
      { label: 'a', previous: undefined },
      { label: 'b', previous: ['a'] },
      { label: 'c', previous: ['b', 'a'] },
      { label: 'x', previous: ['y'] },
      { label: 'y', previous: ['x'] },
      { label: 'z', previous: ['nope'] },
    ]);
    expect(dag.entries).toEqual([0]);
    expect(dag.depth.slice(0, 3)).toEqual([0, 1, 2]);
    expect([...dag.inCycle].sort()).toEqual([3, 4]);
    expect([...dag.reachable].sort()).toEqual([0, 1, 2]);
    expect(dag.unknownRefs[5]).toEqual(['nope']);
  });
});

describe('layoutOrchestrator', () => {
  it('places steps left to right and activities top to bottom', () => {
    const layout = layoutOrchestrator(sampleOrchestrator());
    const [intake, process] = layout.steps;
    expect(process.x).toBeGreaterThan(intake.x + intake.w);
    expect(intake.entry).toBe(true);
    expect(process.automatic).toBe(true);

    const [submit, approve] = intake.activities;
    expect(approve.y).toBeGreaterThan(submit.y + submit.h);
    expect(submit.entry).toBe(true);
    expect(process.activities[0].onFailure).toBe('cancel');
    expect(process.activities[0].cancellation).toBe('undoHandle');

    // 1 step edge + the start arrow; one activity edge per previousActivity link.
    expect(layout.stepEdges).toHaveLength(2);
    expect(layout.activityEdges).toHaveLength(2);
    for (const s of layout.steps) {
      expect(s.x + s.w).toBeLessThanOrEqual(layout.width);
      expect(s.y + s.h).toBeLessThanOrEqual(layout.height);
    }
  });

  it('wraps long chains onto rows that fit the width', () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({
      label: `s${i}`,
      ...(i ? { previousStep: [`s${i - 1}`] } : {}),
      activityList: [{ label: 'a', workflowLabel: 'w' }],
    }));
    const wide = layoutOrchestrator({ stepList: steps });
    expect(new Set(wide.steps.map(s => s.y)).size).toBe(1);

    const wrapped = layoutOrchestrator({ stepList: steps }, 1100);
    expect(wrapped.width).toBeLessThanOrEqual(1100);
    const rowsY = [...new Set(wrapped.steps.map(s => s.y))];
    expect(rowsY.length).toBeGreaterThan(2);
    // reading order is kept: each next step is to the right on the same row, or on a lower row
    for (let i = 1; i < wrapped.steps.length; i++) {
      const [a, b] = [wrapped.steps[i - 1], wrapped.steps[i]];
      expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true);
    }
    expect(wrapped.stepEdges).toHaveLength(10); // 9 links + the start arrow
  });

  it('gives each link into a join step its own entry point and lane', () => {
    const config = {
      stepList: [
        { label: 'main', activityList: [{ label: 'a', workflowLabel: 'w' }] },
        { label: 'step2', previousStep: ['main'], activityList: [{ label: 'a', workflowLabel: 'w' }] },
        { label: 'step3', previousStep: ['step2', 'main'], activityList: [{ label: 'a', workflowLabel: 'w' }] },
      ],
    };
    for (const maxWidth of [Infinity, 700]) {
      const layout = layoutOrchestrator(config, maxWidth);
      expect(layout.steps[2].after).toEqual(['step2', 'main']);
      const ends = layout.stepEdges.slice(0, 3).map(e => e.d.split(' ').slice(-2).join(','));
      expect(new Set(ends).size).toBe(3); // no two arrows end at the same point
    }
    // On one row, main -> step3 skips step2, so it is routed above the row (it starts at main's top edge).
    const oneRow = layoutOrchestrator(config);
    const [main, step2] = oneRow.steps;
    const starts = oneRow.stepEdges.map(e => e.d.split(' ').slice(1, 3).map(Number));
    const fromMainTop = starts.filter(([x, y]) => y === main.y && x > main.x && x < main.x + main.w);
    expect(fromMainTop).toHaveLength(1);
    // ...and its lane runs above step2 instead of through it
    const skip = oneRow.stepEdges[starts.findIndex(([x, y]) => y === main.y && x > main.x)];
    const laneY = Number(skip.d.split(' ')[5]);
    expect(laneY).toBeLessThan(step2.y);
  });

  it('survives broken documents', () => {
    expect(layoutOrchestrator(null).steps).toHaveLength(0);
    expect(layoutOrchestrator({ stepList: 'x' }).steps).toHaveLength(0);
    const cyclic = layoutOrchestrator({
      stepList: [
        { label: 'a', previousStep: ['b'], activityList: [{ label: 'x', previousActivity: ['x'] }] },
        { label: 'b', previousStep: ['a'] },
      ],
    });
    expect(cyclic.steps).toHaveLength(2);
    expect(cyclic.stepEdges.every(e => e.broken)).toBe(true);
    expect(cyclic.start).toBeNull();
  });
});

describe('json-path', () => {
  it('round-trips paths and edits immutably', () => {
    const path = parsePath('stepList[1].activityList[0].label');
    expect(path).toEqual(['stepList', 1, 'activityList', 0, 'label']);
    expect(pathToString(path)).toBe('stepList[1].activityList[0].label');

    const doc = { stepList: [{ label: 'a' }, { label: 'b', activityList: [{ label: 'x' }] }] };
    const next = setAt(doc, path, 'y');
    expect(getAt(next, path)).toBe('y');
    expect(getAt(doc, path)).toBe('x');
    expect(next.stepList[0]).toBe(doc.stepList[0]);

    const removed = setAt(doc, ['stepList', 0], undefined);
    expect(removed.stepList).toHaveLength(1);
  });
});
