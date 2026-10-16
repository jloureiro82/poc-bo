import { Issue, IssueCollector } from './issues';
import { findSpelProblems } from './spel';
import { JsonPath, isObject } from './json-path';
import {
  DERIVED_WORKFLOW_KEYS,
  KNOWN_COMPONENTS,
  MESSENGER_PROVIDERS,
  NOTIFICATION_TYPES,
  STORED_WORKFLOW_KEYS,
  TASK_TYPES,
  UNREGISTERED_TASK_TYPES,
  UNSTORED_WORKFLOW_KEYS,
  WORKER_TASK_TYPES,
} from './model';
import { HTTP_METHODS, isLogicalTask } from './task-templates';

/** What the validator knows about the workflows the service runs (absent when not connected). */
export interface WorkflowCatalog {
  /** Whether a workflow with this name has a running version. The service lists no other versions. */
  has(name: string): boolean;
}

export interface ValidationContext {
  workflows?: WorkflowCatalog;
}

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
    case 'loop':
      lists.push({ path: ['tasks'], title: 'loop body' });
      break;
  }
  return lists;
}

export function caseKeyText(cs: unknown): string {
  return isObject(cs) && cs['key'] !== undefined ? JSON.stringify(cs['key']) : '(no key)';
}

/**
 * Validates a workflow definition against what workflow-manager's create endpoint
 * (`WorkflowConfigurationApiService.create`) stores and what its engine expects. Task `type` picks the dispatcher
 * (`EngineConfiguration.taskDispatcher`); worker types then pick a `TaskHandler` by `component`.
 */
export function validateWorkflow(definition: unknown, context: ValidationContext = {}): Issue[] {
  const c = new IssueCollector();
  const root: JsonPath = [];

  if (!isObject(definition)) {
    c.error(root, 'The workflow definition must be a JSON object');
    return c.issues;
  }

  if (typeof definition['name'] !== 'string' || !definition['name'].trim()) {
    const hint = typeof definition['label'] === 'string' ? ' (found "label": this service identifies a workflow by "name")' : '';
    c.error(root, `Name is required${hint}`, 'name');
  }

  // `Messenger.send` throws "Not Found Messenger Provider" for anything no messenger handles, null included.
  const messenger = definition['messengerProvider'];
  if (typeof messenger !== 'string' || !messenger.trim()) {
    c.error(root, `messengerProvider is required (${MESSENGER_PROVIDERS.join(', ')}): without it the workflow cannot start`, 'messengerProvider');
  } else if (!(MESSENGER_PROVIDERS as readonly string[]).includes(messenger)) {
    c.error(root, `Unknown messengerProvider "${messenger}" (known: ${MESSENGER_PROVIDERS.join(', ')})`, 'messengerProvider');
  }

  for (const key of ['outputParameters', 'failureOutputParameters', 'failureInputParameters', 'rejectionInputParameters', 'pullContext', 'pushContext']) {
    if (definition[key] != null && !isObject(definition[key])) {
      c.error(root, `${key} must be a JSON object`, key);
    }
  }
  for (const key of ['input', 'webhooks']) {
    if (definition[key] != null && !Array.isArray(definition[key])) {
      c.error(root, `${key} must be a list`, key);
    }
  }
  if (definition['suppressFailureOutputErrorList'] != null && typeof definition['suppressFailureOutputErrorList'] !== 'boolean') {
    c.error(root, 'suppressFailureOutputErrorList must be true or false', 'suppressFailureOutputErrorList');
  }
  validateContexts(c, definition);
  for (const key of ['failureWorkflowId', 'rejectionWorkflowId']) {
    validateWorkflowReference(c, definition, root, key, context);
  }
  validateStoredKeys(c, definition);

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

/**
 * `WorkflowService.internalCreate` pulls the context named by `pullContext.stackId`; `WorkflowService.complete` saves
 * `pushContext.stackParameters` under `pushContext.stackId`, and skips the save when the id is missing.
 */
function validateContexts(c: IssueCollector, definition: Record<string, unknown>): void {
  const pull = definition['pullContext'];
  if (isObject(pull) && (pull['stackId'] == null || pull['stackId'] === '')) {
    c.error([], 'pullContext needs stackId: the key of the context to load when the workflow starts', 'pullContext');
  }
  const push = definition['pushContext'];
  if (isObject(push)) {
    if (push['stackId'] == null || push['stackId'] === '') {
      c.warn([], 'pushContext has no stackId, so the context is not saved when the workflow completes', 'pushContext');
    }
    if (push['stackParameters'] != null && !isObject(push['stackParameters']) && !isExpression(push['stackParameters'])) {
      c.error([], 'pushContext.stackParameters must be a JSON object (the values to save)', 'pushContext');
    }
  }
}

/** The create endpoint copies a fixed set of top-level keys; anything else never reaches the stored definition. */
function validateStoredKeys(c: IssueCollector, definition: Record<string, unknown>): void {
  for (const key of Object.keys(definition)) {
    if ((STORED_WORKFLOW_KEYS as readonly string[]).includes(key) || (DERIVED_WORKFLOW_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    if (definition[key] == null) {
      continue;
    }
    if ((UNSTORED_WORKFLOW_KEYS as readonly string[]).includes(key)) {
      c.info([], `${key} is accepted by the service but not stored, so it has no effect`, key);
    } else if (key !== 'label') {
      c.warn([], `${key} is not stored: the service keeps only the workflow fields it knows, and drops this one on publish`, key);
    } else if (typeof definition['name'] === 'string') {
      c.warn([], 'label is not stored: the service identifies a workflow by name, and drops label on publish', key);
    }
  }
}

/** `WorkflowFailure` runs these workflows by name when the run fails or is rejected. */
function validateWorkflowReference(
  c: IssueCollector,
  node: Record<string, unknown>,
  path: JsonPath,
  key: string,
  context: ValidationContext,
): void {
  const value = node[key];
  if (value == null) {
    return;
  }
  if (typeof value !== 'string' || !value.trim()) {
    c.error(path, `${key} must be the name of a workflow`, key);
  } else if (context.workflows && !isExpression(value) && !context.workflows.has(value)) {
    c.error(path, `${key}: no workflow named "${value}" is running in the service (it does not exist, or has no active version)`, key);
  }
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
    c.warn(
      tp,
      `Duplicate task label "${label}" (also at ${labels.get(label)}): results are kept by label, so one overwrites the other`,
      'label',
    );
  } else {
    labels.set(label, tp.join('.'));
  }

  const type = task['type'];
  if (type == null) {
    c.error(tp, 'type is required: no dispatcher handles a task without one', 'type');
  } else if (type === 'parallel') {
    c.error(tp, 'The parallel task type is not used: run the tasks one after another', 'type');
  } else if (isUnregisteredTaskType(type)) {
    c.error(tp, `No dispatcher is registered for type "${String(type)}" in workflow-manager, so the task fails with "Unable to execute task"`, 'type');
  } else if (!isKnownTaskType(type)) {
    c.error(tp, `Unknown task type "${String(type)}" (known: ${TASK_TYPES.join(', ')})`, 'type');
  }

  validateRetry(c, task, tp);
  if (task['active'] != null && typeof task['active'] !== 'boolean') {
    c.error(tp, 'active must be true or false', 'active');
  } else if (task['active'] === false) {
    c.info(tp, 'active is false: the engine skips this task', 'active');
  }
  for (const key of ['failureWorkflowId', 'rejectionWorkflowId']) {
    validateWorkflowReference(c, task, tp, key, context);
  }

  // Every ${...} anywhere in the task (child task lists are checked as tasks of their own).
  const childKeys = ['decision', 'for', 'loop', 'parallel'].includes(type as string) ? ['tasks', 'cases', 'default'] : [];
  for (const finding of findSpelProblems(task, childKeys)) {
    c.error(tp, finding.message, finding.field);
  }

  if ((WORKER_TASK_TYPES as readonly string[]).includes(type as string)) {
    validateComponent(c, task, tp);
  }

  switch (type) {
    case 'logical':
      requireField(c, task, tp, 'expression', 'A logical task needs an expression');
      break;
    case 'decision':
      validateDecision(c, task, tp, labels, context);
      break;
    case 'for':
      requireField(c, task, tp, 'list', 'A for task needs a list expression to iterate over');
      requireTasks(c, task, tp, ['tasks'], 'A for task needs a non-empty tasks list (the loop body)', labels, context);
      break;
    case 'loop':
      requireField(c, task, tp, 'expression', 'A loop task needs an expression: the body runs again until it is true');
      requireTasks(c, task, tp, ['tasks'], 'A loop task needs a non-empty tasks list (the loop body)', labels, context);
      break;
  }

  if (task['tasks'] != null && type !== 'for' && type !== 'loop' && type !== 'parallel') {
    c.warn(tp, `"tasks" is ignored on a ${String(type)} task`, 'tasks');
  }
}

/**
 * `SimpleTaskExecution.getRetry` accepts a number or digits as text. `getRetryDelay` / `getRetryDelayMillis` cast to
 * `String` before parsing, so those two must be text.
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
    } else if (!/^\d+$/.test(delay) && !isExpression(delay)) {
      c.error(tp, `${key} must be a whole number of milliseconds, written as text`, key);
    }
  }
}

/** `terminate` is matched case-insensitively by its dispatcher, every other type exactly. */
function isKnownTaskType(type: unknown): boolean {
  return typeof type === 'string' && ((TASK_TYPES as readonly string[]).includes(type) || type.toLowerCase() === 'terminate');
}

function isUnregisteredTaskType(type: unknown): boolean {
  return typeof type === 'string' && UNREGISTERED_TASK_TYPES.some(t => t.toLowerCase() === type.toLowerCase());
}

function isExpression(value: unknown): boolean {
  return typeof value === 'string' && value.includes('${');
}

function validateComponent(c: IssueCollector, task: Record<string, unknown>, tp: JsonPath): void {
  const component = task['component'];
  if (typeof component !== 'string' || !component.trim()) {
    // TaskHandlerResolverContext falls back to the task's "name" when there is no component.
    if (typeof task['name'] === 'string' && task['name'].trim()) {
      c.info(tp, `No component: the handler is resolved from the task's name "${task['name']}" (the older form)`, 'component');
    } else {
      c.error(tp, `A ${String(task['type'])} task needs a component (the task handler to run)`, 'component');
    }
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
  const mapIsExpression = isExpression(map);
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
 * Mirrors `Http.handle`: with `inputParameters.endpoint` the request comes from that configured route; otherwise from
 * `inputParameters.url` / `httpMethod` (default POST) / `headers`. In that second mode the handler passes `headers`
 * straight to `HttpHeaders.setAll`, which fails on a missing map, so `headers` must be present (it may be empty).
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
  if (input['headers'] == null) {
    c.error(tp, 'inputParameters.headers is required (use {} for none): the http handler fails without it', 'inputParameters.headers');
  } else if (!isObject(input['headers'])) {
    c.error(tp, 'inputParameters.headers must be a JSON object', 'inputParameters.headers');
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
      if (cs['key'] == null) {
        c.error(tp, `cases[${i}] has no key: the engine fails when it compares the cases`, `cases[${i}].key`);
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
      // DecisionTaskDispatcher reads default as { tasks } and starts its first task; when that task completes,
      // DecisionTaskCompletionHandler.resolveCase reads default as a list and the run fails with a cast error.
      if (fallback['tasks'].length > 0) {
        c.error(
          tp,
          'default has tasks: the engine starts the first one, then fails the run with a cast error. Give every expected value its own case instead',
          'default',
        );
      }
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
