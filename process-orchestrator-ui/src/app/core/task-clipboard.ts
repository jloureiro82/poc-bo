import { getAt, isObject } from './json-path';
import { TaskConfig } from './model';
import { childTaskLists } from './workflow-validator';

/**
 * Copy / paste and duplicate of tasks. A task is identified by its label, so pasted tasks whose label is already
 * taken get a new one. References to a renamed task from inside the pasted tasks (`execution.<label>`) follow it,
 * so a copied loop keeps reading its own body.
 */

/** Every label used in a list of tasks, nested ones included. */
export function labelsIn(tasks: unknown): Set<string> {
  const labels = new Set<string>();
  forEachTask(tasks, t => {
    if (typeof t['label'] === 'string' && t['label']) {
      labels.add(t['label']);
    }
  });
  return labels;
}

/**
 * Reads tasks from clipboard text: one task object or an array of them. Anything else (a whole workflow, plain text)
 * gives `null`.
 */
export function parseTasks(text: string): TaskConfig[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const isTask = (v: unknown) => isObject(v) && (typeof v['type'] === 'string' || typeof v['label'] === 'string');
  if (isTask(parsed)) {
    return [parsed as TaskConfig];
  }
  if (Array.isArray(parsed) && parsed.length && parsed.every(isTask)) {
    return parsed as TaskConfig[];
  }
  return null;
}

/**
 * Copies the tasks so they can go into a document whose labels are `taken`: clashing labels get a free name
 * (`label` → `labelCopy`, `labelCopy2`, …), and references to them inside the copied tasks are updated.
 */
export function prepareForPaste(tasks: TaskConfig[], taken: Set<string>): { tasks: TaskConfig[]; renamed: Map<string, string> } {
  const copy = structuredClone(tasks);
  const used = new Set(taken);
  const renamed = new Map<string, string>();
  forEachTask(copy, t => {
    const label = t['label'];
    if (typeof label !== 'string' || !label) {
      return;
    }
    if (used.has(label)) {
      let next = `${label}Copy`;
      for (let n = 2; used.has(next); n++) {
        next = `${label}Copy${n}`;
      }
      t['label'] = next;
      renamed.set(label, next);
      used.add(next);
    } else {
      used.add(label);
    }
  });
  return { tasks: renamed.size ? (renameReferences(copy, renamed) as TaskConfig[]) : copy, renamed };
}

/** Rewrites `execution.old` and `execution['old']` in every string of `value`. */
export function renameReferences(value: unknown, renamed: Map<string, string>): unknown {
  const patterns = [...renamed].map(([from, to]) => ({
    dot: new RegExp(`(execution\\.)${escape(from)}(?![\\w$])`, 'g'),
    bracket: new RegExp(`(execution\\[\\s*)(['"])${escape(from)}\\2`, 'g'),
    to,
  }));
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return patterns.reduce((s, p) => s.replace(p.dot, `$1${p.to}`).replace(p.bracket, `$1$2${p.to}$2`), node);
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (isObject(node)) {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };
  return walk(value);
}

/** Calls `fn` on every task of the list and of the lists nested in it, parents first. */
export function forEachTask(tasks: unknown, fn: (task: Record<string, unknown>) => void): void {
  if (!Array.isArray(tasks)) {
    return;
  }
  for (const task of tasks) {
    if (isObject(task)) {
      fn(task);
      for (const child of childTaskLists(task)) {
        forEachTask(getAt(task, child.path), fn);
      }
    }
  }
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
