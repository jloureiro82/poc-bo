import { TaskConfig } from './model';

/**
 * Ready-made tasks for the workflow editor's "add task" menu. Each one is valid as created, using the fields its
 * dispatcher / TaskHandler actually reads (see workflow-validator.ts).
 */
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  create(label: string): TaskConfig;
}

/** HTTP methods the `http` handler can send (`inputParameters.endpoint.httpMethod`, default POST). */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * Fields of the `http` component (workflow-core `Http.handle`): `inputParameters.{url, httpMethod, headers, body}`,
 * or `inputParameters.endpoint` naming a route from `workflowengine.endpoints.routes` (which then supplies url, method
 * and headers). `successCondition` and `rawRequest` sit on the task itself.
 */
export function httpFields(): Partial<TaskConfig> {
  return {
    inputParameters: {
      url: 'https://example.org/api/resource',
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {},
    },
    successCondition: '${true}',
  };
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'logical',
    name: 'Logical check',
    description: 'Evaluates an expression; the task fails when it is false',
    create: label => ({ label, type: 'simple', component: 'logical', expression: '${true}' }),
  },
  {
    id: 'http',
    name: 'HTTP call',
    description: 'Calls an endpoint; successCondition decides whether the response is a success',
    create: label => ({ label, type: 'simple', component: 'http', retry: 0, ...httpFields() }),
  },
  {
    id: 'email',
    name: 'Email notification',
    description: 'Sends an email through the notification service (SOAP MailRequest)',
    create: label => ({
      label,
      type: 'simple',
      component: 'notification',
      notificationType: 'email',
      systemName: '',
      clientName: '',
      clientId: '',
      emailFrom: '',
      emailTo: [],
      subject: '',
      template: '',
      content: {},
    }),
  },
  {
    id: 'sms',
    name: 'SMS notification',
    description: 'Sends an SMS through the notification service; outputs notificationId',
    create: label => ({
      label,
      type: 'simple',
      component: 'notification',
      notificationType: 'sms',
      systemName: '',
      clientName: '',
      clientId: '',
      phoneNumber: '',
      template: '',
      content: {},
    }),
  },
  {
    id: 'mapResolver',
    name: 'Map resolver',
    description: 'Looks a value up in a nested map, one key per level, with DEFAULT as the fallback at each level',
    create: label => ({
      label,
      type: 'simple',
      component: 'mapResolver',
      keys: { key1: "${workflow['requestContext']['area']}", key2: "${workflow['requestContext']['type']}" },
      map: {
        DEFAULT: { DEFAULT: 'defaultValue' },
      },
    }),
  },
  {
    id: 'decision',
    name: 'Decision',
    description: 'Runs the case whose key equals the expression value',
    create: label => ({
      label,
      type: 'decision',
      expression: "${workflow['requestContext']['type']}",
      cases: [
        { key: 'a', tasks: [] },
        { key: 'b', tasks: [] },
      ],
    }),
  },
  {
    id: 'for',
    name: 'For each',
    description: 'Runs the loop body once per element of list; each run gets the element as listMember',
    create: label => ({
      label,
      type: 'for',
      list: "${workflow['requestContext']['items']}",
      tasks: [{ label: `${label}Item`, type: 'simple', component: 'logical', expression: '${true}' }],
    }),
  },
  {
    id: 'subFlow',
    name: 'Sub-workflow',
    description: 'Runs another stored workflow',
    create: label => ({ label, type: 'subFlow', flowName: '', inputParameters: {} }),
  },
  {
    id: 'manual',
    name: 'Manual',
    description: 'Stops the workflow until it is resumed from outside',
    create: label => ({ label, type: 'manual' }),
  },
  {
    id: 'terminate',
    name: 'Terminate',
    description: 'Ends the workflow here',
    create: label => ({ label, type: 'terminate' }),
  },
];

/** Logical tasks just evaluate an expression, so retrying them is pointless and the editor never offers it. */
export function isLogicalTask(task: Record<string, unknown>): boolean {
  return task['type'] === 'logical' || task['component'] === 'logical';
}
