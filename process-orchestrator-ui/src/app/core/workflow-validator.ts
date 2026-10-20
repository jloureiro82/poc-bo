import { Issue, IssueCollector } from './issues';
import { findSpelProblems, isSingleSpelExpression } from './spel';
import { JsonPath, isObject } from './json-path';
import { KNOWN_COMPONENTS, NOTIFICATION_TYPES, TASK_TYPES, WORKER_TASK_TYPES } from './model';
import { ValidationContext } from './orchestrator-validator';
import { HTTP_METHODS, isLogicalTask } from './task-templates';

/** Where nested task lists live inside a task, by task type. Used by the validator, the tree and the diagram. */
export function childTaskLists(task: Record<string, unknown>): { path: JsonPath; title: string }[] {
  const lists: { path: JsonPath; title: string }[] = [];
  switch (task['type']) {
    case 'decision': {
      const cases = Array.isArray(task['cases']) ? task['cases'] : [];
      cases.forEach((cs, i) => lists.push({ path: ['cases', i, 'tasks'], title: `case ${caseKeyText(cs)}` }));
      if (isObject(task['default'])) {
        lists.push({ path: ['default', 'tasks'], title: 'default' });
      }
      break;
    }
    case 'for':
      lists.push({ path: ['tasks'], title: 'loop body' });
      break;
  }
  return lists;
}

export function caseKeyText(cs: unknown): string {
  return isObject(cs) && cs['key'] !== undefined ? JSON.stringify(cs['key']) : '(no key)';
}

/**
 * Validates a workflow definition against what `POST /workflow/create` (`WorkflowDefinitionValidator`) and the
 * workflow-core dispatchers expect. Task `type` picks the dispatcher; worker types then pick a `TaskHandler` bean by
 * `component`.
 */
export function validateWorkflow(definition: unknown, context: ValidationContext = {}): Issue[] {
  const c = new IssueCollector();
  const root: JsonPath = [];

  if (!isObject(definition)) {
    c.error(root, 'The workflow definition must be a JSON object');
    return c.issues;
  }

  if (typeof definition['label'] !== 'string' || !definition['label'].trim()) {
    const hint = typeof definition['name'] === 'string' ? ' (found "name": the service reads "label")' : '';
    c.error(root, `Label is required${hint}`, 'label');
  }
  for (const key of ['outputParameters', 'failureOutputParameters', 'inputParameters', 'pullContext', 'pushContext']) {
    if (definition[key] != null && !isObject(definition[key])) {
      c.error(root, `${key} must be a JSON object`, key);
    }
  }
  if (definition['suppressFailureOutputErrorList'] != null && typeof definition['suppressFailureOutputErrorList'] !== 'boolean') {
    c.error(root, 'suppressFailureOutputErrorList must be true or false', 'suppressFailureOutputErrorList');
  }

  const tasks = definition['tasks'];
  if (tasks == null || (Array.isArray(tasks) && tasks.length === 0)) {
    c.error(root, 'At least one task is required', 'tasks');
    return c.issues;
  }
  if (!Array.isArray(tasks)) {
    c.error(root, 'tasks must be a list', 'tasks');
    return c.issues;
  }

  for (const finding of findSpelProblems(definition, ['tasks'])) {
    c.error(root, finding.message, finding.field);
  }

  const labels = new Map<string, string>();
  validateTaskList(c, tasks, ['tasks'], labels, context);
  return c.issues;
}

function validateTaskList(
  c: IssueCollector,
  tasks: unknown[],
  base: JsonPath,
  labels: Map<string, string>,
  context: ValidationContext,
): void {
  tasks.forEach((task, i) => validateTask(c, task, [...base, i], labels, context));
}

function validateTask(
  c: IssueCollector,
  task: unknown,
  tp: JsonPath,
  labels: Map<string, string>,
  context: ValidationContext,
): void {
  if (!isObject(task)) {
    c.error(tp, 'A task must be a JSON object');
    return;
  }

  const label = task['label'];
  if (typeof label !== 'string' || !label.trim()) {
    c.error(tp, 'Every task needs a non-blank label', 'label');
  } else if (labels.has(label)) {
    c.warn(tp, `Duplicate task label "${label}" (also at ${labels.get(label)}): executions become hard to tell apart`, 'label');
  } else {
    labels.set(label, tp.join('.'));
  }

  const type = task['type'];
  if (type == null) {
    c.error(tp, 'type is required: no dispatcher handles a task without one', 'type');
  } else if (type === 'parallel') {
    c.error(tp, 'The parallel task type is not used: run the tasks one after another, or split them into separate activities', 'type');
  } else if (!isKnownTaskType(type)) {
    c.error(tp, `Unknown task type "${String(type)}" (known: ${TASK_TYPES.join(', ')})`, 'type');
  }

  validateRetry(c, task, tp);

  // Every ${...} anywhere in the task (child task lists are checked as tasks of their own).
  const childKeys = ['decision', 'for', 'parallel'].includes(type as string) ? ['tasks', 'cases', 'default'] : [];
  for (const finding of findSpelProblems(task, childKeys)) {
    c.error(tp, finding.message, finding.field);
  }

  if ((WORKER_TASK_TYPES as readonly string[]).includes(type as string)) {
    validateComponent(c, task, tp);
  }

  switch (type) {
    case 'logical':
    case 'validate':
      requireField(c, task, tp, 'expression', `A ${type} task needs an expression`);
      break;
    case 'decision':
      validateDecision(c, task, tp, labels, context);
      break;
    case 'for':
      requireField(c, task, tp, 'list', 'A for task needs a list expression to iterate over');
      requireTasks(c, task, tp, ['tasks'], 'A for task needs a non-empty tasks list (the loop body)', labels, context);
      break;
    default:
      if (typeof type === 'string' && type.toLowerCase() === 'subflow') {
        const flowName = task['flowName'];
        if (typeof flowName !== 'string' || !flowName.trim()) {
          c.error(tp, 'A subFlow task needs flowName (the workflow to run)', 'flowName');
        } else if (context.workflows && !flowName.includes('${')) {
          if (!context.workflows.has(flowName)) {
            c.error(tp, `No workflow named "${flowName}" exists in the service`, 'flowName');
          } else if (!context.workflows.hasActive(flowName)) {
            c.warn(tp, `Workflow "${flowName}" has no active version`, 'flowName');
          }
        }
      }
  }

  if (task['tasks'] != null && type !== 'for' && type !== 'parallel') {
    c.warn(tp, `"tasks" is ignored on a ${String(type)} task`, 'tasks');
  }
}

/**
 * workflow-core `SimpleTaskExecution.getRetry` accepts a number or digits as text. `getRetryDelay` /
 * `getRetryDelayMillis` cast to `String` before parsing, so those two must be text.
 */
function validateRetry(c: IssueCollector, task: Record<string, unknown>, tp: JsonPath): void {
  const retry = task['retry'];
  const wholeNumber = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0) || (typeof v === 'string' && /^\d+$/.test(v));
  if (retry != null && !wholeNumber(retry)) {
    c.error(tp, 'retry must be a whole number >= 0', 'retry');
  } else if (retry != null && isLogicalTask(task)) {
    c.warn(tp, 'Logical tasks should not set retry: re-evaluating the same expression gives the same result', 'retry');
  }
  for (const key of ['retryDelay', 'retryDelayMillis']) {
    const delay = task[key];
    if (delay == null) {
      continue;
    }
    if (typeof delay !== 'string') {
      c.error(tp, `${key} must be text holding milliseconds, e.g. "1000": the engine fails on a bare number`, key);
    } else if (!/^\d+$/.test(delay) && !delay.includes('${')) {
      c.error(tp, `${key} must be a whole number of milliseconds, written as text`, key);
    }
  }
}

/** `subFlow` and `terminate` are matched case-insensitively by workflow-core, every other type exactly. */
function isKnownTaskType(type: unknown): boolean {
  if (typeof type !== 'string') {
    return false;
  }
  const lower = type.toLowerCase();
  return (TASK_TYPES as readonly string[]).includes(type) || lower === 'subflow' || lower === 'terminate';
}

function validateComponent(c: IssueCollector, task: Record<string, unknown>, tp: JsonPath): void {
  const component = task['component'];
  if (typeof component !== 'string' || !component.trim()) {
    c.error(tp, `A ${String(task['type'])} task needs a component (the task handler bean to run)`, 'component');
    return;
  }
  if (!(KNOWN_COMPONENTS as readonly string[]).includes(component)) {
    c.warn(tp, `Unknown component "${component}" (known: ${KNOWN_COMPONENTS.join(', ')}); make sure a TaskHandler bean has that name`, 'component');
  }
  if (component === 'logical') {
    requireField(c, task, tp, 'expression', 'The logical component evaluates "expression"; it is missing');
  }
  if (component === 'http') {
    validateHttp(c, task, tp);
    validateHttpOutcome(c, task, tp);
  }
  if (component === 'notification') {
    const notificationType = task['notificationType'];
    if (!(NOTIFICATION_TYPES as readonly string[]).includes(notificationType as string)) {
      c.error(tp, `notificationType must be one of ${NOTIFICATION_TYPES.join(', ')}`, 'notificationType');
    }
    requireField(c, task, tp, 'template', 'A notification task needs a template (the notification service template id)');
    if (notificationType === 'email') {
      const to = task['emailTo'];
      if (!Array.isArray(to) || to.length === 0) {
        c.error(tp, 'An email notification needs emailTo: a non-empty list of addresses', 'emailTo');
      }
      for (const key of ['emailFrom', 'subject']) {
        if (task[key] == null || task[key] === '') {
          c.warn(tp, `${key} is empty`, key);
        }
      }
    }
    if (notificationType === 'sms') {
      requireField(c, task, tp, 'phoneNumber', 'An SMS notification needs a phoneNumber');
    }
    for (const key of ['content', 'protectedContent']) {
      if (task[key] != null && !isObject(task[key])) {
        c.error(tp, `${key} must be a JSON object (field id -> value)`, key);
      }
    }
  }
  if (component === 'mapResolver') {
    validateMapResolver(c, task, tp);
  }
}

/** Mirrors MapResolver.handle: keys sorted by the number in their name, one per map level, string leaves. */
function validateMapResolver(c: IssueCollector, task: Record<string, unknown>, tp: JsonPath): void {
  const map = task['map'];
  const keys = task['keys'];
  // The map may be a SpEL expression, evaluated at run time; its shape can only be checked when it is inline.
  const mapIsExpression = typeof map === 'string' && map.includes('${');
  if (typeof map === 'string' && !mapIsExpression) {
    c.error(tp, 'map must be a nested JSON object or a ${...} expression that yields one', 'map');
  } else if (!mapIsExpression && (!isObject(map) || Object.keys(map).length === 0)) {
    c.error(tp, 'A mapResolver task needs map: a nested JSON object, or a ${...} expression that yields one', 'map');
  }
  if (!isObject(keys) || Object.keys(keys).length === 0) {
    c.error(tp, 'A mapResolver task needs keys, e.g. { "key1": "${...}", "key2": "${...}" }', 'keys');
    return;
  }
  const badNames = Object.keys(keys).filter(k => !/\d/.test(k));
  if (badNames.length) {
    c.error(tp, `Every key name needs a number giving its level (e.g. key1, key2); fix: ${badNames.join(', ')}`, 'keys');
  }
  if (!isObject(map)) {
    return;
  }
  const depth = (node: unknown): number =>
    isObject(node) ? 1 + Math.max(0, ...Object.values(node).map(depth)) : 0;
  const levels = depth(map);
  const keyCount = Object.keys(keys).length;
  if (keyCount > levels) {
    c.error(tp, `${keyCount} keys but the map only has ${levels} level(s): the handler rejects this`, 'keys');
  }
  const leaves: unknown[] = [];
  const collect = (node: unknown) => (isObject(node) ? Object.values(node).forEach(collect) : leaves.push(node));
  collect(map);
  if (leaves.some(v => typeof v !== 'string')) {
    c.error(tp, 'Every final value in map must be a string (the handler returns only strings)', 'map');
  }
  if (!('DEFAULT' in map)) {
    c.info(tp, 'The map has no DEFAULT entry at its first level: an unmatched key fails the task', 'map');
  }
}

/**
 * Mirrors workflow-core `Http.handle`: with `inputParameters.endpoint` the request comes from that configured route;
 * otherwise from `inputParameters.url` / `httpMethod` (default POST) / `headers`.
 */
function validateHttp(c: IssueCollector, task: Record<string, unknown>, tp: JsonPath): void {
  const input = task['inputParameters'];
  if (!isObject(input)) {
    c.error(tp, 'An http task needs inputParameters with a url', 'inputParameters.url');
    return;
  }
  if (input['endpoint'] != null) {
    if (typeof input['endpoint'] !== 'string' || !input['endpoint'].trim()) {
      c.error(tp, 'inputParameters.endpoint must be the name of a configured route', 'inputParameters.endpoint');
    } else {
      c.info(
        tp,
        `Uses the route "${input['endpoint']}": it must exist under workflowengine.endpoints.routes in the service config`,
        'inputParameters.endpoint',
      );
    }
    for (const key of ['url', 'httpMethod', 'headers']) {
      if (input[key] != null) {
        c.warn(tp, `inputParameters.${key} is ignored when inputParameters.endpoint is set`, `inputParameters.${key}`);
      }
    }
    return;
  }
  const url = input['url'];
  if (typeof url !== 'string' || !url.trim()) {
    c.error(tp, 'An http task needs inputParameters.url (or inputParameters.endpoint naming a route)', 'inputParameters.url');
  }
  const method = input['httpMethod'];
  if (method != null && !(HTTP_METHODS as readonly string[]).includes(method as string)) {
    c.error(tp, `Unknown httpMethod "${String(method)}" (known: ${HTTP_METHODS.join(', ')}; default POST)`, 'inputParameters.httpMethod');
  }
  if (input['headers'] != null && !isObject(input['headers'])) {
    c.error(tp, 'inputParameters.headers must be a JSON object', 'inputParameters.headers');
  }
}

/**
 * How workflow-core `Http.handle` and `SimpleWorker` judge the response `{ statusCode, body | rawBody, headers }`.
 * - `successCondition` is read only when it is text. Once the key is there, 4xx/5xx responses go to it too instead of
 *   failing the task, so a non-text value lets every response through.
 * - `errorHandler: false` stops 4xx/5xx from being errors. It matters only without a successCondition.
 * - `instantFailureCondition` (text or true/false) is checked when the call fails; true skips the remaining retries.
 * A condition must be one `${...}`: text around it makes the template a string, which counts as false.
 */
function validateHttpOutcome(c: IssueCollector, task: Record<string, unknown>, tp: JsonPath): void {
  const success = task['successCondition'];
  if (success != null && typeof success !== 'string') {
    c.warn(tp, 'successCondition is ignored unless it is text, and then every response counts as a success, 4xx and 5xx included', 'successCondition');
  } else if (typeof success === 'string' && !isSingleSpelExpression(success)) {
    c.error(
      tp,
      'successCondition must be one ${...} expression with nothing around it, e.g. ${statusCode == 200}: anything else is text, which counts as false, so the task always fails',
      'successCondition',
    );
  }

  const errorHandler = task['errorHandler'];
  if (errorHandler != null && typeof errorHandler !== 'boolean') {
    c.error(tp, 'errorHandler must be true or false', 'errorHandler');
  } else if (errorHandler === false && typeof success !== 'string') {
    c.warn(tp, 'errorHandler is false and there is no successCondition, so 4xx and 5xx responses count as success', 'errorHandler');
  } else if (errorHandler != null && typeof success === 'string') {
    c.info(tp, 'errorHandler has no effect here: the successCondition judges every response, 4xx and 5xx included', 'errorHandler');
  }

  const instant = task['instantFailureCondition'];
  if (instant == null) {
    return;
  }
  if (typeof instant !== 'string' && typeof instant !== 'boolean') {
    c.error(tp, 'instantFailureCondition must be a ${...} expression, or true or false', 'instantFailureCondition');
  } else if (typeof instant === 'string' && !isSingleSpelExpression(instant)) {
    c.warn(
      tp,
      'instantFailureCondition must be one ${...} expression with nothing around it: anything else is text, which counts as false, so it never applies',
      'instantFailureCondition',
    );
  } else if (!(Number(task['retry']) > 0)) {
    c.info(tp, 'instantFailureCondition only skips retries, and this task has no retry', 'instantFailureCondition');
  }
}

function validateDecision(
  c: IssueCollector,
  task: Record<string, unknown>,
  tp: JsonPath,
  labels: Map<string, string>,
  context: ValidationContext,
): void {
  requireField(c, task, tp, 'expression', 'A decision task needs an expression; its value selects the case');
  const cases = task['cases'];
  if (!Array.isArray(cases) || cases.length === 0) {
    c.error(tp, 'A decision task needs a non-empty cases list ("you must specify \'cases\' in a switch statement")', 'cases');
  } else {
    const keys = new Set<string>();
    cases.forEach((cs, i) => {
      if (!isObject(cs)) {
        c.error(tp, `cases[${i}] must be an object with "key" and "tasks"`, `cases[${i}]`);
        return;
      }
      if (cs['key'] === undefined) {
        c.error(tp, `cases[${i}] has no key, so it can never be selected`, `cases[${i}].key`);
      } else {
        const keyText = JSON.stringify(cs['key']);
        if (keys.has(keyText)) {
          c.warn(tp, `cases[${i}] repeats key ${keyText}: only the first matching case runs`, `cases[${i}].key`);
        }
        keys.add(keyText);
      }
      requireTasks(c, task, tp, ['cases', i, 'tasks'], `cases[${i}] has no tasks`, labels, context, 'warning');
    });
  }
  // default is optional: without it, an unmatched value just runs nothing.
  const fallback = task['default'];
  if (fallback != null) {
    if (!isObject(fallback)) {
      c.error(tp, 'default must be an object with "tasks"', 'default');
    } else if (Array.isArray(fallback['tasks'])) {
      validateTaskList(c, fallback['tasks'], [...tp, 'default', 'tasks'], labels, context);
    } else if (fallback['tasks'] != null) {
      c.error(tp, 'default.tasks must be a list', 'default.tasks');
    }
  }
}

function requireField(c: IssueCollector, task: Record<string, unknown>, tp: JsonPath, field: string, message: string): void {
  const value = task[field];
  if (value == null || (typeof value === 'string' && !value.trim())) {
    c.error(tp, message, field);
  }
}

function requireTasks(
  c: IssueCollector,
  task: Record<string, unknown>,
  tp: JsonPath,
  rel: JsonPath,
  message: string,
  labels: Map<string, string>,
  context: ValidationContext,
  severity: 'error' | 'warning' = 'error',
): void {
  let list: unknown = task;
  for (const part of rel) {
    list = isObject(list) || Array.isArray(list) ? (list as any)[part] : undefined;
  }
  const field = rel.map((p, i) => (typeof p === 'number' ? `[${p}]` : i ? `.${p}` : p)).join('');
  if (!Array.isArray(list) || list.length === 0) {
    if (severity === 'error') {
      c.error(tp, message, field);
    } else {
      c.warn(tp, message, field);
    }
    return;
  }
  validateTaskList(c, list, [...tp, ...rel], labels, context);
}
