import { JsonPath, getAt, isObject, pathToString, setAt } from './json-path';
import { childTaskLists } from './workflow-validator';

/**
 * What changes between two versions of a configuration, in the terms people review: top-level fields, and nodes
 * matched by label (so moving a node does not show it as removed and added again). Workflows are compared task by
 * task, orchestrators step by step and activity by activity.
 */

export interface FieldChange {
  /** Relative path of the field, e.g. `inputParameters.url`. */
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

export interface NodeChange {
  /** What the node is, for the change list. */
  noun: 'task' | 'step' | 'activity';
  label: string;
  kind: 'added' | 'removed' | 'changed' | 'moved';
  /** Where the node sits: in `after`, or in `before` for a removed node. */
  path: string;
  /** Where it sits, in words (`tasks`, `check › case "a"`, `step validate`). */
  where: string;
  /** For a moved node: where it was. */
  from?: string;
  /** Field changes of the node itself; changes inside its nested lists are reported on those nodes. */
  fields: FieldChange[];
}

export interface ConfigDiff {
  fields: FieldChange[];
  nodes: NodeChange[];
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

/** Compares two workflow definitions: workflow fields, then tasks (nested ones included) by label. `null` counts as absent. */
export function diffWorkflows(before: unknown, after: unknown): ConfigDiff {
  const { tasks: tasksA, ...restA } = plain(before);
  const { tasks: tasksB, ...restB } = plain(after);
  return compare(diffValues(restA, restB), flattenTasks(tasksA), flattenTasks(tasksB));
}

/** Compares two orchestrator configurations: top-level fields, then steps by label, then activities by step and label. */
export function diffOrchestrators(before: unknown, after: unknown): ConfigDiff {
  const { stepList: stepsA, ...restA } = plain(before);
  const { stepList: stepsB, ...restB } = plain(after);
  return compare(diffValues(restA, restB), flattenSteps(stepsA), flattenSteps(stepsB));
}

export function diffConfigs(kind: 'workflow' | 'orchestrator', before: unknown, after: unknown): ConfigDiff {
  return kind === 'workflow' ? diffWorkflows(before, after) : diffOrchestrators(before, after);
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

function plain(definition: unknown): Record<string, unknown> {
  return isObject(definition) ? (withoutNulls(definition) as Record<string, unknown>) : {};
}

interface FlatNode {
  noun: NodeChange['noun'];
  label: string;
  path: string;
  where: string;
  /** The container (`parent key + list`) and position, for move detection. */
  container: string;
  index: number;
  /** The node without its nested lists. */
  own: unknown;
}

function compare(fields: FieldChange[], oldNodes: Map<string, FlatNode>, newNodes: Map<string, FlatNode>): ConfigDiff {
  const moved = movedKeys(oldNodes, newNodes);
  const nodes: NodeChange[] = [];
  for (const [key, now] of newNodes) {
    const was = oldNodes.get(key);
    const base = { noun: now.noun, label: now.label, path: now.path, where: now.where };
    if (!was) {
      nodes.push({ ...base, kind: 'added', fields: [] });
      continue;
    }
    const changes = diffValues(was.own, now.own);
    if (moved.has(key)) {
      nodes.push({ ...base, kind: 'moved', from: was.where, fields: changes });
    } else if (changes.length) {
      nodes.push({ ...base, kind: 'changed', fields: changes });
    }
  }
  for (const [key, was] of oldNodes) {
    if (!newNodes.has(key)) {
      nodes.push({ noun: was.noun, label: was.label, kind: 'removed', path: was.path, where: was.where, fields: [] });
    }
  }
  return { fields, nodes, identical: !fields.length && !nodes.length };
}

function labelOf(node: Record<string, unknown>, path: JsonPath): string {
  return typeof node['label'] === 'string' && node['label'] ? node['label'] : `(no label at ${pathToString(path)})`;
}

/** A free key for `label` (a repeated label gets `#2`, `#3`, … so nothing is lost). */
function freeKey(out: Map<string, unknown>, label: string): string {
  let key = label;
  for (let n = 2; out.has(key); n++) {
    key = `${label}#${n}`;
  }
  return key;
}

/** Every task, keyed by label. */
function flattenTasks(list: unknown): Map<string, FlatNode> {
  const out = new Map<string, FlatNode>();
  const walk = (tasks: unknown, base: JsonPath, container: string, where: string) => {
    if (!Array.isArray(tasks)) {
      return;
    }
    tasks.forEach((task, index) => {
      const path = [...base, index];
      const t = isObject(task) ? task : {};
      const label = labelOf(t, path);
      const key = freeKey(out, label);
      let own: unknown = t;
      const children = childTaskLists(t);
      for (const child of children) {
        own = setAt(own, child.path, undefined);
      }
      out.set(key, { noun: 'task', label, path: pathToString(path), where, container, index, own });
      for (const child of children) {
        const rel = pathToString(child.path);
        walk(getAt(t, child.path), [...path, ...child.path], `${key}/${rel}`, `${label} › ${child.title}`);
      }
    });
  };
  walk(list, ['tasks'], '', 'tasks');
  return out;
}

/** Every step keyed by label, and every activity keyed by `step / activity`. */
function flattenSteps(list: unknown): Map<string, FlatNode> {
  const out = new Map<string, FlatNode>();
  if (!Array.isArray(list)) {
    return out;
  }
  list.forEach((step, si) => {
    const path: JsonPath = ['stepList', si];
    const s = isObject(step) ? step : {};
    const label = labelOf(s, path);
    const key = freeKey(out, label);
    const { activityList, ...own } = s;
    out.set(key, { noun: 'step', label, path: pathToString(path), where: 'steps', container: '', index: si, own });
    const activities = Array.isArray(activityList) ? activityList : [];
    activities.forEach((activity, ai) => {
      const apath: JsonPath = [...path, 'activityList', ai];
      const a = isObject(activity) ? activity : {};
      const alabel = labelOf(a, apath);
      out.set(freeKey(out, `${key} / ${alabel}`), {
        noun: 'activity',
        label: alabel,
        path: pathToString(apath),
        where: `step ${label}`,
        container: key,
        index: ai,
        own: a,
      });
    });
  });
  return out;
}

/**
 * Nodes that changed place: those now in another list, plus, within a list, those outside the longest run of nodes
 * that kept their relative order. Inserting or removing a node therefore does not mark the ones after it as moved.
 * An activity is matched within its step, so one that changes step shows as removed and added.
 */
function movedKeys(before: Map<string, FlatNode>, after: Map<string, FlatNode>): Set<string> {
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
