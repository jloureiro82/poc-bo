import { analyzeDag } from './dag';
import { Issue, IssueCollector } from './issues';
import { findSpelProblems } from './spel';
import { JsonPath, isObject } from './json-path';
import { ACTIVITY_TYPES, FAILURE_ACTIONS, STEP_TYPES, TIMEOUT_ACTIONS } from './model';

/** What the validator knows about the workflows stored in the backend (absent when not connected). */
export interface WorkflowCatalog {
  /** Workflow label -> whether it has an active, non-deprecated version. */
  has(label: string): boolean;
  hasActive(label: string): boolean;
}

export interface ValidationContext {
  workflows?: WorkflowCatalog;
}

/**
 * Validates an orchestrator configuration the way the backend will use it.
 *
 * Errors are things the backend rejects on `POST /orchestrator/create` (`OrchestratorConfigValidator`) or that make
 * the flow unable to run (the engine resolves steps/activities by label, starts at the first step without
 * `previousStep` and the first activity without `previousActivity`). Warnings are legal but almost certainly
 * unintended.
 */
export function validateOrchestrator(config: unknown, context: ValidationContext = {}): Issue[] {
  const c = new IssueCollector();
  const root: JsonPath = [];

  if (!isObject(config)) {
    c.error(root, 'The orchestrator configuration must be a JSON object');
    return c.issues;
  }

  if (!isNonBlank(config['label'])) {
    c.error(root, 'Label is required (it is the name the flow is started with)', 'label');
  }
  checkObject(c, root, config['staticVariables'], 'staticVariables');
  for (const finding of findSpelProblems(config['staticVariables'], [], 'staticVariables')) {
    c.error(root, finding.message, finding.field);
  }

  const steps = config['stepList'];
  if (steps == null || (Array.isArray(steps) && steps.length === 0)) {
    c.error(root, 'At least one step is required', 'stepList');
    return c.issues;
  }
  if (!Array.isArray(steps)) {
    c.error(root, 'stepList must be a list', 'stepList');
    return c.issues;
  }

  const stepNodes = steps.map(s => (isObject(s) ? s : {}));
  checkLabels(c, stepNodes, i => ['stepList', i], 'step');
  checkGraph(
    c,
    stepNodes,
    'previousStep',
    i => ['stepList', i],
    {
      kind: 'step',
      noEntry: 'No entry step: one step must have no previousStep, otherwise the flow can never start',
      manyEntries: first =>
        `Only the first step without previousStep ("${first}") is used to start the flow; this one is never started`,
    },
  );

  steps.forEach((step, si) => {
    const sp: JsonPath = ['stepList', si];
    if (!isObject(step)) {
      c.error(sp, 'A step must be a JSON object');
      return;
    }
    checkEnum(c, sp, step['type'], 'type', STEP_TYPES, 'manual');
    checkBoolean(c, sp, step['sync'], 'sync');

    const activities = step['activityList'];
    if (activities == null || (Array.isArray(activities) && activities.length === 0)) {
      c.error(sp, 'The step has no activities, so the flow stops here', 'activityList');
      return;
    }
    if (!Array.isArray(activities)) {
      c.error(sp, 'activityList must be a list', 'activityList');
      return;
    }

    const activityNodes = activities.map(a => (isObject(a) ? a : {}));
    checkLabels(c, activityNodes, ai => [...sp, 'activityList', ai], 'activity');
    checkGraph(c, activityNodes, 'previousActivity', ai => [...sp, 'activityList', ai], {
      kind: 'activity',
      noEntry: 'No entry activity: one activity must have no previousActivity, otherwise the step can never start',
      manyEntries: first =>
        `Only the first activity without previousActivity ("${first}") starts the step; this one is never started`,
    });

    activities.forEach((activity, ai) => {
      const ap: JsonPath = [...sp, 'activityList', ai];
      if (!isObject(activity)) {
        c.error(ap, 'An activity must be a JSON object');
        return;
      }
      validateActivity(c, ap, activity, context);
    });
  });

  return c.issues;
}

function validateActivity(
  c: IssueCollector,
  ap: JsonPath,
  activity: Record<string, unknown>,
  context: ValidationContext,
): void {
  const workflowLabel = activity['workflowLabel'];
  if (!isNonBlank(workflowLabel)) {
    c.error(ap, 'workflowLabel is required: it is the workflow this activity runs', 'workflowLabel');
  } else {
    checkWorkflowRef(c, ap, workflowLabel, 'workflowLabel', context);
  }

  checkEnum(c, ap, activity['type'], 'type', ACTIVITY_TYPES, 'manual');
  checkBoolean(c, ap, activity['sync'], 'sync');
  checkObject(c, ap, activity['staticVariables'], 'staticVariables');

  if (activity['condition'] != null && typeof activity['condition'] !== 'string') {
    c.error(ap, 'condition must be a string expression', 'condition');
  }
  for (const finding of findSpelProblems(activity)) {
    c.error(ap, finding.message, finding.field);
  }

  // Failure policy: mirrors OrchestratorConfigValidator.isFailurePolicyValid.
  const cancellation = activity['cancellationActivity'];
  if (cancellation != null) {
    if (!isObject(cancellation)) {
      c.error(ap, 'cancellationActivity must be an object', 'cancellationActivity');
    } else {
      checkBoolean(c, ap, cancellation['active'], 'cancellationActivity.active');
      checkBoolean(c, ap, cancellation['automaticOnFailure'], 'cancellationActivity.automaticOnFailure');
      checkObject(c, ap, cancellation['staticVariables'], 'cancellationActivity.staticVariables');
      if (isNonBlank(cancellation['label'])) {
        checkWorkflowRef(c, ap, cancellation['label'] as string, 'cancellationActivity.label', context);
      } else if (cancellation['active'] === true) {
        c.error(ap, 'An active cancellationActivity needs a label (the workflow to run)', 'cancellationActivity.label');
      }
      if (cancellation['automaticOnFailure'] === true && cancellation['active'] !== true) {
        c.warn(ap, 'automaticOnFailure has no effect while the cancellationActivity is not active', 'cancellationActivity.automaticOnFailure');
      }
    }
  }

  const onFailure = activity['onFailure'];
  if (onFailure != null) {
    if (!isObject(onFailure)) {
      c.error(ap, 'onFailure must be an object', 'onFailure');
      return;
    }
    const action = onFailure['action'];
    if (typeof action !== 'string' || !(FAILURE_ACTIONS as readonly string[]).includes(action)) {
      c.error(ap, `onFailure.action must be one of ${FAILURE_ACTIONS.join(', ')}`, 'onFailure.action');
      return;
    }
    const cancellable = isObject(cancellation) && cancellation['active'] === true && cancellation['label'] != null;
    if (action === 'cancel' && !cancellable) {
      c.error(ap, 'onFailure.action "cancel" needs an active cancellationActivity with a label', 'onFailure.action');
    }
    // mirrors OrchestratorConfigValidator.isHoldTimeoutValid
    const holdTimeout = onFailure['holdTimeout'];
    const onTimeout = onFailure['onTimeout'];
    if (holdTimeout != null) {
      if (action !== 'hold') {
        c.error(ap, 'onFailure.holdTimeout is only allowed with action "hold"', 'onFailure.holdTimeout');
      } else if (typeof holdTimeout !== 'string' || !isPositiveIsoDuration(holdTimeout)) {
        c.error(ap, 'onFailure.holdTimeout must be a positive ISO-8601 duration, e.g. PT24H', 'onFailure.holdTimeout');
      }
    }
    if (onTimeout != null) {
      if (holdTimeout == null) {
        c.error(ap, 'onFailure.onTimeout needs a holdTimeout', 'onFailure.onTimeout');
      }
      if (typeof onTimeout !== 'string' || !(TIMEOUT_ACTIONS as readonly string[]).includes(onTimeout)) {
        c.error(ap, `onFailure.onTimeout must be one of ${TIMEOUT_ACTIONS.join(', ')}`, 'onFailure.onTimeout');
      } else if (onTimeout === 'cancel' && !cancellable) {
        c.error(ap, 'onFailure.onTimeout "cancel" needs an active cancellationActivity with a label', 'onFailure.onTimeout');
      }
    }
    if (action !== 'cancel' && isObject(cancellation) && cancellation['automaticOnFailure'] === true) {
      c.info(
        ap,
        `onFailure.action "${action}" takes precedence: the cancellation activity will not run automatically on failure`,
        'onFailure.action',
      );
    }
  }
}

/**
 * Whether `value` is an ISO-8601 duration that Java's `Duration.parse` accepts (days, hours, minutes, seconds; no years
 * or months) and that is longer than zero.
 */
export function isPositiveIsoDuration(value: string): boolean {
  const match = /^([-+]?)P(?:([-+]?\d+)D)?(?:T(?:([-+]?\d+)H)?(?:([-+]?\d+)M)?(?:([-+]?\d+(?:[.,]\d{0,9})?)S)?)?$/i.exec(value);
  if (!match || /T$/i.test(value) || !/\d/.test(value)) {
    return false;
  }
  const [, sign, days, hours, minutes, seconds] = match;
  const n = (part: string | undefined) => (part ? Number(part.replace(',', '.')) : 0);
  const total = n(days) * 86400 + n(hours) * 3600 + n(minutes) * 60 + n(seconds);
  return (sign === '-' ? -total : total) > 0;
}

function checkWorkflowRef(c: IssueCollector, node: JsonPath, label: string, field: string, context: ValidationContext): void {
  const catalog = context.workflows;
  if (!catalog) {
    return;
  }
  if (!catalog.has(label)) {
    c.error(node, `No workflow named "${label}" exists in the service`, field);
  } else if (!catalog.hasActive(label)) {
    c.warn(node, `Workflow "${label}" has no active version, so running it will fail`, field);
  }
}

function checkLabels(
  c: IssueCollector,
  nodes: Record<string, unknown>[],
  pathOf: (i: number) => JsonPath,
  kind: string,
): void {
  const seen = new Map<string, number>();
  nodes.forEach((n, i) => {
    const label = n['label'];
    if (!isNonBlank(label)) {
      c.error(pathOf(i), `Every ${kind} needs a non-blank label (${kind}s are referenced by label)`, 'label');
      return;
    }
    if (seen.has(label)) {
      c.error(pathOf(i), `Duplicate ${kind} label "${label}" (also used by ${kind} #${seen.get(label)! + 1})`, 'label');
    } else {
      seen.set(label, i);
    }
  });
}

function checkGraph(
  c: IssueCollector,
  nodes: Record<string, unknown>[],
  previousKey: string,
  pathOf: (i: number) => JsonPath,
  text: { kind: string; noEntry: string; manyEntries: (first: string) => string },
): void {
  nodes.forEach((n, i) => {
    const previous = n[previousKey];
    if (previous == null) {
      return;
    }
    if (!Array.isArray(previous)) {
      c.error(pathOf(i), `${previousKey} must be a list of ${text.kind} labels, e.g. ["submit"]`, previousKey);
    } else if (previous.length === 0) {
      c.error(
        pathOf(i),
        `${previousKey} is an empty list: remove it to make this the entry ${text.kind}, or name a predecessor`,
        previousKey,
      );
    } else if (previous.includes(n['label'])) {
      c.error(pathOf(i), `A ${text.kind} cannot be its own predecessor`, previousKey);
    }
  });

  const dag = analyzeDag(nodes.map(n => ({ label: n['label'] as string | undefined, previous: n[previousKey] })));
  if (dag.entries.length === 0) {
    c.error(pathOf(0).slice(0, -2), text.noEntry);
  }
  dag.entries.slice(1).forEach(i => {
    c.warn(pathOf(i), text.manyEntries(String(nodes[dag.entries[0]]['label'] ?? '#1')), previousKey);
  });
  dag.unknownRefs.forEach((refs, i) => {
    refs.forEach(ref => c.error(pathOf(i), `${previousKey} refers to unknown ${text.kind} "${ref}"`, previousKey));
  });
  dag.inCycle.forEach(i => {
    c.error(pathOf(i), `This ${text.kind} is part of a cycle of ${previousKey} links`, previousKey);
  });

  // Automatic steps/activities chain 1 to 1: when a node completes, Automatic{Step,Activity}Controller starts the
  // automatic successor straight away, so an automatic node needs exactly one predecessor and must be its only
  // successor. Manual ones may have several paths in and out (the caller picks which one to request).
  const name = (i: number) => `"${String(nodes[i]['label'] ?? '#' + (i + 1))}"`;
  const children: number[][] = nodes.map(() => []);
  dag.parents.forEach((parents, child) => parents.forEach(p => children[p].push(child)));
  nodes.forEach((node, i) => {
    if (node['type'] === 'automatic' && Array.isArray(node[previousKey]) && (node[previousKey] as unknown[]).length > 1) {
      c.error(
        pathOf(i),
        `An automatic ${text.kind} must follow exactly one ${text.kind} (1 to 1), but this one follows ` +
          `${(node[previousKey] as unknown[]).map(l => `"${String(l)}"`).join(', ')}; only manual ${text.kind}s can have several paths`,
        previousKey,
      );
    }
  });
  children.forEach((next, p) => {
    const automatic = next.filter(i => nodes[i]['type'] === 'automatic');
    if (next.length > 1 && automatic.length) {
      c.error(
        pathOf(p),
        `${automatic.map(name).join(', ')} ${automatic.length > 1 ? 'are' : 'is'} automatic, so ${automatic.length > 1 ? 'each' : 'it'} must be ` +
          `the only ${text.kind} after this one (1 to 1), but this ${text.kind} is followed by ${next.map(name).join(', ')}`,
      );
    }
  });

  if (dag.entries.length > 0) {
    nodes.forEach((_, i) => {
      if (!dag.reachable.has(i) && !dag.entries.includes(i) && !dag.inCycle.has(i) && dag.unknownRefs[i].length === 0) {
        c.warn(pathOf(i), `This ${text.kind} can never be reached from the entry ${text.kind}`, previousKey);
      }
    });
  }
}

function checkEnum(
  c: IssueCollector,
  node: JsonPath,
  value: unknown,
  field: string,
  allowed: readonly string[],
  fallback: string,
): void {
  if (value != null && !allowed.includes(value as string)) {
    c.warn(node, `Unknown ${field} "${String(value)}": the engine treats it as "${fallback}" (known: ${allowed.join(', ')})`, field);
  }
}

function checkBoolean(c: IssueCollector, node: JsonPath, value: unknown, field: string): void {
  if (value != null && typeof value !== 'boolean') {
    c.error(node, `${field} must be true or false (got ${JSON.stringify(value)})`, field);
  }
}

function checkObject(c: IssueCollector, node: JsonPath, value: unknown, field: string): void {
  if (value != null && !isObject(value)) {
    c.error(node, `${field} must be a JSON object of name/value pairs`, field);
  }
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
