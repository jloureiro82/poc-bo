/**
 * Graph analysis for the `previousStep` / `previousActivity` links of an orchestrator configuration.
 *
 * Nodes are identified by index (labels may be missing or duplicated in a broken config); edges come from
 * each node's list of predecessor labels, resolved against the first node carrying that label.
 */
export interface DagNode {
  label: string | undefined;
  previous: unknown;
}

export interface DagAnalysis {
  /** Indexes of nodes with no predecessor list at all (`previous == null`), in definition order. */
  entries: number[];
  /** For each node, the indexes of its resolved predecessors. */
  parents: number[][];
  /** For each node, the predecessor labels that resolve to no node. */
  unknownRefs: string[][];
  /** Indexes of nodes that sit on a cycle. */
  inCycle: Set<number>;
  /** Indexes reachable from the first entry (the engine only ever starts from the first one). */
  reachable: Set<number>;
  /** Longest-path depth from an entry, cycles broken; used for layout. */
  depth: number[];
}

export function analyzeDag(nodes: DagNode[]): DagAnalysis {
  const indexByLabel = new Map<string, number>();
  nodes.forEach((n, i) => {
    if (n.label != null && !indexByLabel.has(n.label)) {
      indexByLabel.set(n.label, i);
    }
  });

  const parents: number[][] = [];
  const unknownRefs: string[][] = [];
  const entries: number[] = [];
  nodes.forEach((n, i) => {
    const resolved: number[] = [];
    const unknown: string[] = [];
    if (n.previous == null) {
      entries.push(i);
    } else if (Array.isArray(n.previous)) {
      for (const ref of n.previous) {
        const target = typeof ref === 'string' ? indexByLabel.get(ref) : undefined;
        if (target === undefined) {
          unknown.push(String(ref));
        } else if (!resolved.includes(target)) {
          resolved.push(target);
        }
      }
    }
    parents.push(resolved);
    unknownRefs.push(unknown);
  });

  const children: number[][] = nodes.map(() => []);
  parents.forEach((ps, child) => ps.forEach(p => children[p].push(child)));

  // Cycle detection (iterative DFS colouring would be overkill for config-sized graphs).
  const inCycle = new Set<number>();
  const state: number[] = nodes.map(() => 0); // 0 = new, 1 = on stack, 2 = done
  const stack: number[] = [];
  const visit = (i: number): void => {
    state[i] = 1;
    stack.push(i);
    for (const c of children[i]) {
      if (state[c] === 1) {
        for (let k = stack.indexOf(c); k < stack.length; k++) {
          inCycle.add(stack[k]);
        }
      } else if (state[c] === 0) {
        visit(c);
      }
    }
    stack.pop();
    state[i] = 2;
  };
  nodes.forEach((_, i) => state[i] === 0 && visit(i));

  const reachable = new Set<number>();
  if (entries.length > 0) {
    const queue = [entries[0]];
    while (queue.length) {
      const i = queue.shift()!;
      if (!reachable.has(i)) {
        reachable.add(i);
        queue.push(...children[i]);
      }
    }
  }

  const depth: number[] = nodes.map(() => -1);
  const computeDepth = (i: number, seen: Set<number>): number => {
    if (depth[i] >= 0) {
      return depth[i];
    }
    if (seen.has(i)) {
      return 0;
    }
    seen.add(i);
    const d = parents[i].length === 0 ? 0 : 1 + Math.max(...parents[i].map(p => computeDepth(p, seen)));
    seen.delete(i);
    depth[i] = d;
    return d;
  };
  nodes.forEach((_, i) => computeDepth(i, new Set()));

  return { entries, parents, unknownRefs, inCycle, reachable, depth };
}
