import { isObject } from './json-path';
import { forEachTask } from './task-clipboard';

/**
 * The input of a new flow (`POST /api/v1/orchestrator/execution/workflow/start`): its `requestContext`, which the
 * activities' workflows read as `workflow.requestContext` (`${workflow['requestContext']['email']}`).
 */

/**
 * A starting `requestContext` for a flow: every `workflow.requestContext.<path>` its workflows read, as empty text,
 * nested by path. A `for` task's `list` that is just such a reference gets an empty list.
 */
export function requestContextSkeleton(workflows: unknown[]): Record<string, unknown> {
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
  const inContext = (path: string[]) => (path[0] === 'requestContext' && path.length > 1 ? path.slice(1) : null);
  for (const definition of workflows) {
    walkStrings(definition, text => {
      for (const path of workflowReferences(text)) {
        const rest = inContext(path);
        if (rest) {
          put(rest, '');
        }
      }
    });
    forEachTask(isObject(definition) ? definition['tasks'] : null, task => {
      const list = task['list'];
      if (task['type'] === 'for' && typeof list === 'string' && /^\$\{\s*workflow[^}]*\}$/.test(list.trim())) {
        const refs = workflowReferences(list).map(inContext);
        if (refs.length === 1 && refs[0]) {
          lists.push(refs[0]);
        }
      }
    });
  }
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
    for (let s = segment.exec(text); s && path.length < 6; s = segment.exec(text)) {
      path.push(s[1] ?? s[3]);
    }
    if (path.length) {
      out.push(path);
    }
  }
  return out;
}

/** The labels of the workflows a configuration's activities run (cancellation workflows included), first step first. */
export function workflowLabelsOf(config: unknown): string[] {
  const labels = new Set<string>();
  const steps = isObject(config) && Array.isArray(config['stepList']) ? config['stepList'] : [];
  for (const step of steps) {
    const activities = isObject(step) && Array.isArray(step['activityList']) ? step['activityList'] : [];
    for (const a of activities) {
      if (isObject(a) && typeof a['workflowLabel'] === 'string' && a['workflowLabel']) {
        labels.add(a['workflowLabel']);
      }
      const cancel = isObject(a) ? a['cancellationActivity'] : null;
      if (isObject(cancel) && typeof cancel['label'] === 'string' && cancel['label']) {
        labels.add(cancel['label']);
      }
    }
  }
  return [...labels];
}

/** What is remembered of a start request, per flow. */
export interface RunInput {
  owner?: string;
  channel?: string;
  requestContext: Record<string, unknown>;
}

/**
 * What a flow was started with, read from its first activity run: the service records the start request there
 * (`{ orchestrationFlow, owner, channel, requestContext, orchestrationId }`).
 */
export function startInputOf(input: Record<string, unknown> | null): RunInput {
  if (!isObject(input)) {
    return { requestContext: {} };
  }
  const text = (key: string) => (typeof input[key] === 'string' && input[key] ? { [key]: input[key] as string } : {});
  if (isObject(input['requestContext'])) {
    return { ...text('owner'), ...text('channel'), requestContext: input['requestContext'] };
  }
  const { orchestrationId, orchestrationFlow, owner, channel, ...rest } = input;
  return { ...text('owner'), ...text('channel'), requestContext: rest };
}

const key = (flow: string) => `po-ui.run-input.${flow}`;

/** The input last sent to this flow from here, if any. */
export function loadRunInput(flow: string): RunInput | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(flow)) ?? 'null');
    return isObject(parsed) && isObject(parsed['requestContext']) ? (parsed as unknown as RunInput) : null;
  } catch {
    return null;
  }
}

export function saveRunInput(flow: string, input: RunInput): void {
  try {
    localStorage.setItem(key(flow), JSON.stringify(input));
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
