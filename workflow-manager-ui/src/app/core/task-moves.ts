import { JsonPath, getAt, isObject } from './json-path';

/**
 * Moves the task at `from` into the task list at `toList`, before position `index` (or at the end when `index` is
 * past it). Works on a copy and finds the lists by reference before changing anything, so moving between lists
 * whose paths shift because of the removal (e.g. a task moved into a later sibling's branch) still lands right.
 *
 * Returns null when the move is impossible: into itself or one of its own branches, or a path that does not exist.
 */
export function moveTask<T>(doc: T, from: JsonPath, toList: JsonPath, index: number): { doc: T; moved: unknown } | null {
  if (startsWith(toList, from)) {
    return null; // a task cannot go inside itself
  }
  const copy = structuredClone(doc);
  const source = getAt(copy, from.slice(0, -1));
  const sourceIndex = from[from.length - 1] as number;
  if (!Array.isArray(source) || sourceIndex >= source.length) {
    return null;
  }
  const target = ensureList(copy, toList);
  if (!target) {
    return null;
  }
  const [task] = source.splice(sourceIndex, 1);
  let at = Math.min(index, target.length + (source === target ? 1 : 0));
  if (source === target && sourceIndex < at) {
    at--;
  }
  target.splice(Math.min(at, target.length), 0, task);
  return { doc: copy, moved: task };
}

/** Finds where an object ended up (by identity) among the task lists. */
export function findTaskPath(doc: unknown, task: unknown, base: JsonPath = []): JsonPath | null {
  const node = base.length ? getAt(doc, base) : doc;
  if (node === task) {
    return base;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const found = findTaskPath(doc, task, [...base, i]);
      if (found) {
        return found;
      }
    }
  } else if (isObject(node)) {
    for (const key of Object.keys(node)) {
      if (key === 'tasks' || key === 'cases' || key === 'default') {
        const found = findTaskPath(doc, task, [...base, key]);
        if (found) {
          return found;
        }
      }
    }
  }
  return null;
}

/** The list at `path`, creating a missing final `tasks` array, and a decision's missing `default` object. */
function ensureList(doc: unknown, path: JsonPath): unknown[] | null {
  const existing = getAt(doc, path);
  if (Array.isArray(existing)) {
    return existing;
  }
  if (existing !== undefined || path[path.length - 1] !== 'tasks') {
    return null;
  }
  let parent = getAt(doc, path.slice(0, -1));
  // A decision's missing `default` is created on demand (dropping onto its "no match" path).
  const owner = getAt(doc, path.slice(0, -2));
  if (parent === undefined && path[path.length - 2] === 'default' && isObject(owner) && owner['type'] === 'decision') {
    parent = owner['default'] = {};
  }
  if (!isObject(parent)) {
    return null;
  }
  const list: unknown[] = [];
  parent['tasks'] = list;
  return list;
}

function startsWith(path: JsonPath, prefix: JsonPath): boolean {
  return prefix.length <= path.length && prefix.every((p, i) => path[i] === p);
}
