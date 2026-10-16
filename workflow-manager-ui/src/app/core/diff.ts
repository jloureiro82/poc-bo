import { JsonPath, getAt, isObject, pathToString, setAt } from './json-path';
import { DERIVED_WORKFLOW_KEYS, STORED_WORKFLOW_KEYS } from './model';
import { childTaskLists } from './workflow-validator';

/**
 * What changes between two workflow definitions, in the terms people review: workflow fields, and tasks matched by
 * label (so moving a task does not show it as removed and added again).
 */

export interface FieldChange {
  /** Relative path of the field, e.g. `inputParameters.url`. */
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

export interface TaskChange {
  label: string;
  kind: 'added' | 'removed' | 'changed' | 'moved';
  /** Where the task sits: in `after`, or in `before` for a removed task. */
  path: string;
  /** Where it sits, in words (`tasks`, `check › case "a"`). */
  where: string;
  /** For a moved task: where it was. */
  from?: string;
  /** Field changes of the task itself; changes inside its nested task lists are reported on those tasks. */
  fields: FieldChange[];
}

export interface WorkflowDiff {
  fields: FieldChange[];
  tasks: TaskChange[];
  identical: boolean;
}

/** Deep diff of two JSON values. Objects are compared key by key; arrays and scalars as a whole. */
export function diffValues(before: unknown, after: unknown, path = ''): FieldChange[] {
  const out: FieldChange[] = [];
  const walk = (a: unknown, b: unknown, at: string) => {
    if (sameValue(a, b)) {
      return;
    }
    if (isObject(a) && isObject(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        walk(a[key], b[key], at ? `${at}.${key}` : key);
      }
    } else if (a === undefined) {
      out.push({ path: at, kind: 'added', after: b });
    } else if (b === undefined) {
      out.push({ path: at, kind: 'removed', before: a });
    } else {
      out.push({ path: at, kind: 'changed', before: a, after: b });
    }
  };
  walk(before, after, path);
  return out;
}

/**
 * Compares two definitions the way the service stores them: only the stored top-level keys, `null` as absent, and
 * `suppressFailureOutputErrorList` as `true` when it is missing. `description` and `version` come from the version
 * details, so they are left out.
 */
export function diffWorkflows(before: unknown, after: unknown): WorkflowDiff {
  const a = storedForm(before);
  const b = storedForm(after);
  const { tasks: tasksA, ...restA } = a;
  const { tasks: tasksB, ...restB } = b;
  const fields = diffValues(restA, restB);

  const oldTasks = flattenTasks(tasksA);
  const newTasks = flattenTasks(tasksB);
  const moved = movedKeys(oldTasks, newTasks);
  const tasks: TaskChange[] = [];
  for (const [key, now] of newTasks) {
    const was = oldTasks.get(key);
    if (!was) {
      tasks.push({ label: now.label, kind: 'added', path: now.path, where: now.where, fields: [] });
      continue;
    }
    const changes = diffValues(was.own, now.own);
    if (moved.has(key)) {
      tasks.push({ label: now.label, kind: 'moved', path: now.path, where: now.where, from: was.where, fields: changes });
    } else if (changes.length) {
      tasks.push({ label: now.label, kind: 'changed', path: now.path, where: now.where, fields: changes });
    }
  }
  for (const [key, was] of oldTasks) {
    if (!newTasks.has(key)) {
      tasks.push({ label: was.label, kind: 'removed', path: was.path, where: was.where, fields: [] });
    }
  }
  return { fields, tasks, identical: !fields.length && !tasks.length };
}

/** Top-level keys of a definition that the create endpoint will not store. */
export function unstoredKeys(definition: unknown): string[] {
  if (!isObject(definition)) {
    return [];
  }
  const kept = new Set<string>([...STORED_WORKFLOW_KEYS, ...DERIVED_WORKFLOW_KEYS]);
  return Object.keys(definition).filter(k => !kept.has(k));
}

/** A short one-line rendering of a JSON value for change lists. */
export function preview(value: unknown, max = 80): string {
  if (value === undefined) {
    return '—';
  }
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return a === b || stable(a) === stable(b);
}

// ---- internals ---------------------------------------------------------------------------------------------------

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    isObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v,
  ) ?? 'undefined';
}

function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutNulls);
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, withoutNulls(v)]));
  }
  return value;
}

function storedForm(definition: unknown): Record<string, unknown> {
  const doc = isObject(definition) ? (withoutNulls(definition) as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const key of STORED_WORKFLOW_KEYS) {
    if (doc[key] !== undefined) {
      out[key] = doc[key];
    }
  }
  out['suppressFailureOutputErrorList'] ??= true;
  return out;
}

interface FlatTask {
  label: string;
  path: string;
  where: string;
  /** The container (`parent key + list`) and position, for move detection. */
  container: string;
  index: number;
  /** The task without its nested task lists. */
  own: unknown;
}

/** Every task, keyed by label (a repeated label gets `#2`, `#3`, … so nothing is lost). */
function flattenTasks(list: unknown): Map<string, FlatTask> {
  const out = new Map<string, FlatTask>();
  const walk = (tasks: unknown, base: JsonPath, container: string, where: string) => {
    if (!Array.isArray(tasks)) {
      return;
    }
    tasks.forEach((task, index) => {
      const path = [...base, index];
      const t = isObject(task) ? task : {};
      const label = typeof t['label'] === 'string' && t['label'] ? t['label'] : `(no label at ${pathToString(path)})`;
      let key = label;
      for (let n = 2; out.has(key); n++) {
        key = `${label}#${n}`;
      }
      let own: unknown = t;
      const children = childTaskLists(t);
      for (const child of children) {
        own = setAt(own, child.path, undefined);
      }
      out.set(key, { label, path: pathToString(path), where, container, index, own });
      for (const child of children) {
        const rel = pathToString(child.path);
        walk(getAt(t, child.path), [...path, ...child.path], `${key}/${rel}`, `${label} › ${child.title}`);
      }
    });
  };
  walk(list, ['tasks'], '', 'tasks');
  return out;
}

/**
 * Tasks that changed place: those now in another list, plus, within a list, those outside the longest run of tasks
 * that kept their relative order. Inserting or removing a task therefore does not mark the ones after it as moved.
 */
function movedKeys(before: Map<string, FlatTask>, after: Map<string, FlatTask>): Set<string> {
  const moved = new Set<string>();
  const byContainer = new Map<string, string[]>();
  for (const [key, now] of after) {
    const was = before.get(key);
    if (!was) {
      continue;
    }
    if (was.container !== now.container) {
      moved.add(key);
    } else {
      byContainer.set(now.container, [...(byContainer.get(now.container) ?? []), key]);
    }
  }
  for (const keys of byContainer.values()) {
    const newOrder = [...keys].sort((x, y) => after.get(x)!.index - after.get(y)!.index);
    const oldOrder = [...keys].sort((x, y) => before.get(x)!.index - before.get(y)!.index);
    const kept = new Set(longestCommonSubsequence(oldOrder, newOrder));
    keys.filter(k => !kept.has(k)).forEach(k => moved.add(k));
  }
  return moved;
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: string[] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return out;
}
