import { toStored } from './config-api.service';
import { Issue } from './issues';
import { newWorkflow, sampleWorkflow } from './samples';
import { validateWorkflow } from './workflow-validator';

const errors = (issues: Issue[]) => issues.filter(i => i.severity === 'error');
const warnings = (issues: Issue[]) => issues.filter(i => i.severity === 'warning');
const messages = (issues: Issue[]) => issues.map(i => `${i.path}: ${i.message}`).join('\n');

const wf = (tasks: unknown[]) => ({ name: 'w', messengerProvider: 'sync', tasks });

describe('validateWorkflow', () => {
  it('accepts the sample and the blank workflow', () => {
    for (const doc of [sampleWorkflow(), newWorkflow()]) {
      expect(messages(errors(validateWorkflow(doc)))).toBe('');
      expect(messages(warnings(validateWorkflow(doc)))).toBe('');
    }
  });

  it('accepts a workflow from the Postman collection of the service', () => {
    const postman = {
      description: 'Disable account on the multicert system',
      name: 'accountDisable',
      messengerProvider: 'jms',
      workflowId: 'accountDisableMulticert',
      tasks: [
        {
          label: 'loginOnlineStore',
          component: 'http',
          retry: '6',
          retryDelay: '1000',
          rawRequest: false,
          successCondition: '${statusCode == 200}',
          type: 'simple',
          description: 'log in',
          inputParameters: {
            headers: { 'Content-Type': 'application/json' },
            url: '{{online-store-services-endpoint}}/api/v1/login',
            body: { username: 'admin@multicert.dev' },
          },
        },
        {
          label: 'disableAccountOnlineStore',
          component: 'http',
          retry: '6',
          retryDelay: '1000',
          successCondition: "${statusCode == 200 || (statusCode == 400 && 'User is already disabled'.equals(body.message))}",
          type: 'simple',
          inputParameters: {
            httpMethod: 'DELETE',
            url: '{{online-store-services-endpoint}}/api/v3/users/intern/disable',
            headers: { Authorization: 'Bearer ${execution.loginOnlineStore.output.body.accessToken}' },
            body: { email: '${workflow.email}' },
          },
        },
      ],
    };
    const issues = validateWorkflow(postman);
    expect(messages(errors(issues))).toBe('');
    expect(messages(warnings(issues))).toBe('');
    expect(messages(issues)).toContain('workflowId: workflowId is accepted by the service but not stored');
  });

  it('requires a name, a messenger provider and at least one task', () => {
    expect(messages(validateWorkflow({ tasks: [{}] }))).toContain('name: Name is required');
    expect(messages(validateWorkflow({ label: 'x', tasks: [] }))).toContain('found "label": this service identifies a workflow by "name"');
    expect(messages(validateWorkflow({ name: 'x' }))).toContain('tasks: At least one task is required');
    expect(messages(errors(validateWorkflow({ name: 'x', tasks: [{}] })))).toContain('messengerProvider: messengerProvider is required');
    expect(messages(errors(validateWorkflow({ name: 'x', messengerProvider: 'pigeon', tasks: [{}] })))).toContain('Unknown messengerProvider "pigeon"');
  });

  it('tells which top-level fields the create endpoint does not store', () => {
    const issues = validateWorkflow({ ...wf([{ label: 'a', type: 'manual' }]), label: 'w', inputParameters: {}, restartable: true, description: 'd', version: 3, webhooks: null });
    const text = messages(warnings(issues));
    expect(text).toContain('label: label is not stored');
    expect(text).toContain('inputParameters: inputParameters is not stored');
    expect(text).not.toContain('description');
    expect(text).not.toContain('version');
    expect(messages(issues)).toContain('restartable: restartable is accepted by the service but not stored');
    expect(errors(issues)).toHaveLength(0);
  });

  it('accepts a stored version as the service returns it (nulls for every unset field)', () => {
    const stored = toStored({
      entityName: 'w',
      version: 2,
      active: true,
      payload: JSON.stringify({ ...wf([{ label: 'a', type: 'manual' }]), version: 2, description: null, input: null, webhooks: null, failureWorkflowId: null }),
    });
    expect(stored.name).toBe('w');
    expect(stored.details.version).toBe(2);
    expect('webhooks' in stored.body).toBe(false);
    expect(validateWorkflow(stored.body)).toEqual([]);
  });

  it('checks contexts and failure / rejection workflows', () => {
    const base = wf([{ label: 'a', type: 'manual', failureWorkflowId: 'ghostTask' }]);
    const issues = validateWorkflow(
      { ...base, pullContext: {}, pushContext: { stackParameters: {} }, failureWorkflowId: 'ghost', rejectionWorkflowId: 'known' },
      { workflows: { has: name => name === 'known' } },
    );
    expect(messages(errors(issues))).toContain('pullContext: pullContext needs stackId');
    expect(messages(warnings(issues))).toContain('pushContext: pushContext has no stackId');
    expect(messages(errors(issues))).toContain('failureWorkflowId: failureWorkflowId: no workflow named "ghost" is running');
    expect(messages(errors(issues))).toContain('tasks[0].failureWorkflowId: failureWorkflowId: no workflow named "ghostTask"');
    expect(messages(issues)).not.toContain('"known"');
    // Not connected: references are not checked.
    expect(messages(validateWorkflow({ ...base, failureWorkflowId: 'ghost' }))).not.toContain('ghost');
  });

  it('requires a known type and, for worker types, a component', () => {
    const issues = validateWorkflow(
      wf([
        { label: 'a' },
        { label: 'b', type: 'banana' },
        { label: 'c', type: 'simple' },
        { label: 'd', type: 'Terminate' },
        { label: 'e', type: 'simple', name: 'http', inputParameters: { url: 'https://x', headers: {} } },
      ]),
    );
    const text = messages(errors(issues));
    expect(text).toContain('tasks[0].type: type is required');
    expect(text).toContain('tasks[1].type: Unknown task type "banana"');
    expect(text).toContain('tasks[2].component: A simple task needs a component');
    expect(text).not.toContain('tasks[3]');
    expect(text).not.toContain('tasks[4]');
    expect(messages(issues)).toContain('tasks[4].component: No component: the handler is resolved from the task\'s name "http"');
  });

  it('rejects the types this service has no dispatcher for, and parallel', () => {
    const text = messages(
      errors(
        validateWorkflow(
          wf([
            { label: 's', type: 'subFlow', flowName: 'x' },
            { label: 'v', type: 'validate', expression: '${true}' },
            { label: 'y', type: 'async', component: 'print' },
            { label: 'p', type: 'parallel', tasks: [] },
          ]),
        ),
      ),
    );
    expect(text).toContain('tasks[0].type: No dispatcher is registered for type "subFlow"');
    expect(text).toContain('tasks[1].type: No dispatcher is registered for type "validate"');
    expect(text).toContain('tasks[2].type: No dispatcher is registered for type "async"');
    expect(text).toContain('tasks[3].type: The parallel task type is not used');
  });

  it('checks component-specific fields', () => {
    const issues = validateWorkflow(
      wf([
        { label: 'a', type: 'simple', component: 'logical' },
        { label: 'b', type: 'simple', component: 'notification', notificationType: 'fax' },
        { label: 'c', type: 'simple', component: 'custom' },
      ]),
    );
    const text = messages(issues);
    expect(text).toContain('tasks[0].expression: The logical component evaluates "expression"');
    expect(text).toContain('tasks[1].notificationType: notificationType must be one of email, sms');
    expect(text).toContain('tasks[1].template');
    expect(messages(warnings(issues))).toContain('Unknown component "custom"');
  });

  it('checks decision tasks and walks into their branches', () => {
    const issues = validateWorkflow(
      wf([
        {
          label: 'd',
          type: 'decision',
          expression: '${x}',
          cases: [{ key: 'a', tasks: [{ label: 'inner', type: 'simple' }] }, { tasks: [] }, { key: 'a', tasks: [] }],
          default: { tasks: [{ label: 'fallback' }] },
        },
        { label: 'e', type: 'decision' },
      ]),
    );
    const text = messages(issues);
    expect(text).toContain('tasks[0].cases[0].tasks[0].component: A simple task needs a component');
    expect(text).toContain('tasks[0].cases[1].key: cases[1] has no key');
    expect(text).toContain('tasks[0].cases[2].key: cases[2] repeats key "a"');
    expect(text).toContain('tasks[0].default.tasks[0].type: type is required');
    expect(text).toContain('tasks[1].expression: A decision task needs an expression');
    expect(text).toContain("tasks[1].cases: A decision task needs a non-empty cases list");
    const nested = issues.find(i => i.path === 'tasks[0].cases[0].tasks[0].component');
    expect(nested?.node).toBe('tasks[0].cases[0].tasks[0]');
  });

  it('checks for and loop tasks and walks into their bodies', () => {
    const text = messages(
      errors(
        validateWorkflow(
          wf([
            { label: 'f', type: 'for' },
            { label: 'l', type: 'loop' },
            { label: 'ok', type: 'loop', expression: '${true}', tasks: [{ label: 'inner', type: 'simple' }] },
          ]),
        ),
      ),
    );
    expect(text).toContain('tasks[0].list');
    expect(text).toContain('tasks[0].tasks: A for task needs a non-empty tasks list');
    expect(text).toContain('tasks[1].expression: A loop task needs an expression');
    expect(text).toContain('tasks[1].tasks: A loop task needs a non-empty tasks list');
    expect(text).toContain('tasks[2].tasks[0].component: A simple task needs a component');
  });

  it('warns about duplicate labels, unclosed expressions and bad retry values', () => {
    const issues = validateWorkflow(
      wf([
        { label: 'a', type: 'logical', expression: '${x == 1' },
        { label: 'a', type: 'logical', expression: '${true}', retry: -1 },
        { label: 'b', type: 'manual', retry: '3', retryDelay: 1000 },
        { label: 'c', type: 'manual', retry: 'x', retryDelay: 'soon' },
        { label: 'd', type: 'manual', retry: 2, retryDelay: '1000', retryDelayMillis: '250' },
      ]),
    );
    expect(messages(warnings(issues))).toContain('tasks[1].label: Duplicate task label "a"');
    const text = messages(errors(issues));
    expect(text).toContain('tasks[0].expression: SpEL syntax:');
    expect(text).toContain('tasks[1].retry: retry must be a whole number >= 0');
    expect(text).not.toContain('tasks[2].retry:');
    expect(text).toContain('tasks[2].retryDelay: retryDelay must be text holding milliseconds');
    expect(text).toContain('tasks[3].retry: retry must be a whole number >= 0');
    expect(text).toContain('tasks[3].retryDelay: retryDelay must be a whole number of milliseconds');
    expect(text).not.toContain('tasks[4]');
  });

  it('checks http tasks and accepts every template as created', async () => {
    const { TASK_TEMPLATES } = await import('./task-templates');
    const tasks = TASK_TEMPLATES.map((t, i) => t.create(`t${i}`));
    // Templates are valid as created, except the fields only the user can fill in (addresses, phone number, template id).
    const errs = errors(validateWorkflow(wf(tasks)));
    const byTemplate = (id: string) => errs.filter(e => e.node.startsWith(`tasks[${TASK_TEMPLATES.findIndex(t => t.id === id)}]`));
    for (const t of TASK_TEMPLATES.filter(t => !['email', 'sms'].includes(t.id))) {
      expect(messages(byTemplate(t.id))).toBe('');
    }
    expect(messages(byTemplate('email'))).toContain('emailTo');
    expect(messages(byTemplate('sms'))).toContain('phoneNumber');

    const http = (inputParameters?: unknown) =>
      validateWorkflow(wf([{ label: 'h', type: 'simple', component: 'http', ...(inputParameters ? { inputParameters } : {}) }]));
    expect(messages(errors(http()))).toContain('tasks[0].inputParameters.url: An http task needs inputParameters with a url');
    expect(messages(errors(http({ body: {}, headers: {} })))).toContain('tasks[0].inputParameters.url: An http task needs inputParameters.url');
    expect(messages(errors(http({ url: 'https://x', httpMethod: 'FETCH', headers: {} })))).toContain('Unknown httpMethod "FETCH"');
    expect(messages(errors(http({ url: 'https://x' })))).toContain('tasks[0].inputParameters.headers: inputParameters.headers is required');
    expect(messages(errors(http({ url: 'https://x', httpMethod: 'GET', headers: { a: 'b' }, body: {} })))).toBe('');
    // Configured-route mode: endpoint names a route, and url/method/headers are ignored.
    const route = http({ endpoint: 'billing', url: 'https://x' });
    expect(messages(errors(route))).toBe('');
    expect(messages(warnings(route))).toContain('inputParameters.url is ignored when inputParameters.endpoint is set');
    expect(messages(errors(http({ endpoint: { url: 'https://x' } })))).toContain('must be the name of a configured route');
  });

  it('mirrors how the http handler judges the response: successCondition, errorHandler, instantFailureCondition', () => {
    const http = (extra: Record<string, unknown>) =>
      validateWorkflow(wf([{ label: 'h', type: 'simple', component: 'http', inputParameters: { url: 'https://x', headers: {} }, ...extra }]));
    const infos = (issues: Issue[]) => issues.filter(i => i.severity === 'info');

    expect(messages(http({ successCondition: '${statusCode == 200}', retry: 2, instantFailureCondition: '${statusCode == 400}' }))).toBe('');
    expect(messages(http({ successCondition: "${statusCode == 200 || body['a'] == '}'}" }))).toBe('');
    // Only a single ${...} yields a boolean; anything else is a string, which the handler treats as false.
    for (const text of ['statusCode == 200', 'true', '', ' ${true}', '${a} ${b}', '${a} == 1']) {
      expect(messages(errors(http({ successCondition: text })))).toContain('tasks[0].successCondition: successCondition must be one ${...} expression');
    }
    expect(messages(warnings(http({ successCondition: true })))).toContain('tasks[0].successCondition: successCondition is ignored unless it is text');

    expect(messages(errors(http({ errorHandler: 'false' })))).toContain('tasks[0].errorHandler: errorHandler must be true or false');
    expect(messages(warnings(http({ errorHandler: false })))).toContain('4xx and 5xx responses count as success');
    expect(messages(infos(http({ errorHandler: false, successCondition: '${true}' })))).toContain('errorHandler has no effect here');
    expect(messages(http({ errorHandler: true }))).toBe('');

    expect(messages(errors(http({ instantFailureCondition: 1 })))).toContain('tasks[0].instantFailureCondition: instantFailureCondition must be');
    expect(messages(warnings(http({ instantFailureCondition: 'statusCode == 400', retry: 1 })))).toContain('so it never applies');
    expect(messages(infos(http({ instantFailureCondition: true })))).toContain('this task has no retry');
    expect(messages(http({ instantFailureCondition: true, retry: '3' }))).toBe('');
  });

  it('warns when a logical task sets retry', () => {
    const issues = validateWorkflow(wf([{ label: 'l', type: 'simple', component: 'logical', expression: '${true}', retry: 0 }]));
    expect(messages(warnings(issues))).toContain('tasks[0].retry: Logical tasks should not set retry');
  });

  it('mirrors MapResolver: numbered keys, enough levels, string leaves', () => {
    const task = (extra: Record<string, unknown>) => ({ label: 'm', type: 'simple', component: 'mapResolver', ...extra });
    const ok = validateWorkflow(wf([task({ keys: { key1: 'a', key2: 'b' }, map: { DEFAULT: { DEFAULT: 'x' }, a: { b: 'y' } } })]));
    expect(messages(errors(ok))).toBe('');

    const text = messages(
      errors(
        validateWorkflow(
          wf([
            task({}),
            task({ keys: { first: 'a' }, map: { a: 'x' } }),
            task({ keys: { key1: 'a', key2: 'b', key3: 'c' }, map: { a: { b: 'x' } } }),
            task({ keys: { key1: 'a' }, map: { a: 1 } }),
          ]),
        ),
      ),
    );
    expect(text).toContain('tasks[0].map');
    expect(text).toContain('tasks[0].keys');
    expect(text).toContain('tasks[1].keys: Every key name needs a number');
    expect(text).toContain('tasks[2].keys: 3 keys but the map only has 2 level(s)');
    expect(text).toContain('tasks[3].map: Every final value in map must be a string');

    // A SpEL map is accepted as is (checked at run time); a plain string is not a map.
    const spel = validateWorkflow(wf([task({ keys: { key1: 'a', key2: 'b' }, map: "${workflow['routing']}" })]));
    expect(messages(errors(spel))).toBe('');
    expect(messages(errors(validateWorkflow(wf([task({ keys: { key1: 'a' }, map: 'routing' })]))))).toContain(
      'map must be a nested JSON object or a ${...} expression',
    );
  });

  it('checks email and sms notification fields', () => {
    const text = messages(
      errors(
        validateWorkflow(
          wf([
            { label: 'e', type: 'simple', component: 'notification', notificationType: 'email', template: 't', emailTo: 'a@b.c' },
            { label: 's', type: 'simple', component: 'notification', notificationType: 'sms', template: 't' },
          ]),
        ),
      ),
    );
    expect(text).toContain('tasks[0].emailTo: An email notification needs emailTo');
    expect(text).toContain('tasks[1].phoneNumber: An SMS notification needs a phoneNumber');
  });

  it('treats the decision default as optional', () => {
    const decision = (extra: Record<string, unknown>) =>
      validateWorkflow(wf([{ label: 'd', type: 'decision', expression: '${x}', cases: [{ key: 'a', tasks: [{ label: 'a1', type: 'terminate' }] }], ...extra }]));
    expect(decision({})).toEqual([]);
    expect(decision({ default: { tasks: [] } })).toEqual([]);
    // Seen on the running service: the first default task runs, then the run fails with a cast error.
    expect(messages(errors(decision({ default: { tasks: [{ label: 'd1', type: 'manual' }] } })))).toContain('tasks[0].default: default has tasks');
    expect(messages(errors(decision({ default: 'x' })))).toContain('default must be an object');
  });
});
