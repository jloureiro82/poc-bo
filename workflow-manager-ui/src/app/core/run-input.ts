import { isObject } from './json-path';
import { forEachTask } from './task-clipboard';

/**
 * The input of a run (`POST /api/v1/execution/workflow/{name}/run`): the request body, which expressions read as
 * `workflow` (`${workflow.email}`, `${workflow['type']}`). The service adds `workflowId` to it.
 */

/**
 * Keys in a run's input that the service sets, not the person who starts the run: `workflowId` (added by the run
 * endpoint, `WorkflowExecutionResource`), `parentTaskExecutionId` (when a task of another workflow started the run,
 * `WorkflowService.internalCreate`) and `transactionId` (a failure workflow's run).
 */
const SERVICE_INPUT_KEYS = ['workflowId', 'parentTaskExecutionId', 'transactionId'];

/**
 * A starting input for a definition: every `workflow.<path>` the expressions read, as empty text, nested by path.
 * A `for` task's `list` that is just `${workflow.<path>}` gets an empty list.
 */
export function inputSkeleton(definition: unknown): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const lists: string[][] = [];
  const put = (path: string[], leaf: unknown, force = false) => {
    let node = root;
    path.forEach((key, i) => {
      if (i === path.length - 1) {
        if (force || !(key in node)) {
          node[key] = leaf;
        }
      } else {
        node[key] = isObject(node[key]) ? node[key] : {};
        node = node[key] as Record<string, unknown>;
      }
    });
  };
  walkStrings(definition, text => {
    for (const path of workflowReferences(text)) {
      put(path, '');
    }
  });
  forEachTask(isObject(definition) ? definition['tasks'] : null, task => {
    const list = task['list'];
    if (task['type'] === 'for' && typeof list === 'string') {
      const refs = workflowReferences(list);
      if (refs.length === 1 && /^\$\{\s*workflow[^}]*\}$/.test(list.trim())) {
        lists.push(refs[0]);
      }
    }
  });
  for (const path of lists) {
    put(path, [], true);
  }
  return root;
}

/** The `workflow.<path>` references in a template: `workflow.a.b`, `workflow['a']`, `workflow["a"].b`. */
export function workflowReferences(text: string): string[][] {
  const out: string[][] = [];
  const start = /(?<![\w$.#])workflow(?=[.[])/g;
  const segment = /\.([A-Za-z_$][\w$]*)(?![\w$]|\s*\()|\[\s*(['"])([^'"\]]+)\2\s*\]/y;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    const path: string[] = [];
    segment.lastIndex = m.index + m[0].length;
    for (let s = segment.exec(text); s && path.length < 5; s = segment.exec(text)) {
      path.push(s[1] ?? s[3]);
    }
    if (path.length && !SERVICE_INPUT_KEYS.includes(path[0])) {
      out.push(path);
    }
  }
  return out;
}

/**
 * A recorded run's input, ready to send again: only the request body, which the service stores under `workflow`
 * (`WorkflowService.internalCreate`: `inputs = { workflow: body }`), without the keys the service set in it. Anything
 * else in the stored input is the service's own, so a run without a `workflow` body gives an empty input.
 */
export function reusableInput(inputs: Record<string, unknown> | null): Record<string, unknown> {
  const body = inputs?.['workflow'];
  if (!isObject(body)) {
    return {};
  }
  return Object.fromEntries(Object.entries(body).filter(([k]) => !SERVICE_INPUT_KEYS.includes(k)));
}

const key = (name: string) => `wm-ui.run-input.${name}`;

/** The input last sent to this workflow from here, if any. */
export function loadRunInput(name: string): string | null {
  try {
    return localStorage.getItem(key(name));
  } catch {
    return null;
  }
}

export function saveRunInput(name: string, text: string): void {
  try {
    localStorage.setItem(key(name), text);
  } catch {
    // storage unavailable: the input is not remembered
  }
}

function walkStrings(value: unknown, fn: (text: string) => void): void {
  if (typeof value === 'string') {
    if (value.includes('workflow')) {
      fn(value);
    }
  } else if (Array.isArray(value)) {
    value.forEach(v => walkStrings(v, fn));
  } else if (isObject(value)) {
    Object.values(value).forEach(v => walkStrings(v, fn));
  }
}
