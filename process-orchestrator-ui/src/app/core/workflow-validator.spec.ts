import { Issue } from './issues';
import { sampleWorkflow } from './samples';
import { validateWorkflow } from './workflow-validator';

const errors = (issues: Issue[]) => issues.filter(i => i.severity === 'error');
const warnings = (issues: Issue[]) => issues.filter(i => i.severity === 'warning');
const messages = (issues: Issue[]) => issues.map(i => `${i.path}: ${i.message}`).join('\n');

const wf = (tasks: unknown[]) => ({ label: 'w', tasks });

describe('validateWorkflow', () => {
  it('accepts the sample workflow', () => {
    expect(messages(errors(validateWorkflow(sampleWorkflow())))).toBe('');
    expect(messages(warnings(validateWorkflow(sampleWorkflow())))).toBe('');
  });

  it('accepts the Postman collection workflow', () => {
    const postman = {
      description: 'Http Sucess',
      label: 'logicalSuccess',
      messengerProvider: 'sync',
      suppressFailureOutputErrorList: true,
      tasks: [
        {
          label: 'checkEntryParameters',
          type: 'simple',
          component: 'logical',
          expression: '${true == true }',
          failureOutputParameters: { code: '-1', causeMessage: 'Missing parameters' },
        },
      ],
      outputParameters: { code: '0000', message: 'Success' },
      failureOutputParameters: { code: '-1', message: 'Failure' },
    };
    expect(errors(validateWorkflow(postman))).toHaveLength(0);
  });

  it('mirrors the server rules: label and at least one task', () => {
    expect(messages(validateWorkflow({ tasks: [{}] }))).toContain('label: Label is required');
    expect(messages(validateWorkflow({ name: 'x', tasks: [] }))).toContain('found "name": the service reads "label"');
    expect(messages(validateWorkflow({ label: 'x' }))).toContain('tasks: At least one task is required');
  });

  it('requires a known type and, for worker types, a component', () => {
    const text = messages(
      errors(
        validateWorkflow(
          wf([
            { label: 'a' },
            { label: 'b', type: 'banana' },
            { label: 'c', type: 'simple' },
            { label: 'd', type: 'SUBFLOW', flowName: 'x' },
            { label: 'e', type: 'Terminate' },
          ]),
        ),
      ),
    );
    expect(text).toContain('tasks[0].type: type is required');
    expect(text).toContain('tasks[1].type: Unknown task type "banana"');
    expect(text).toContain('tasks[2].component: A simple task needs a component');
    expect(text).not.toContain('tasks[3]');
    expect(text).not.toContain('tasks[4]');
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

  it('checks for / subFlow / validate tasks and rejects parallel', () => {
    const text = messages(
      errors(
        validateWorkflow(
          wf([
            { label: 'f', type: 'for' },
            { label: 'p', type: 'parallel', tasks: [] },
            { label: 's', type: 'subFlow' },
            { label: 'v', type: 'validate' },
          ]),
        ),
      ),
    );
    expect(text).toContain('tasks[0].list');
    expect(text).toContain('tasks[0].tasks: A for task needs a non-empty tasks list');
    expect(text).toContain('tasks[1].type: The parallel task type is not used');
    expect(text).toContain('tasks[2].flowName');
    expect(text).toContain('tasks[3].expression');
  });

  it('checks subFlow targets against the stored workflows', () => {
    const issues = validateWorkflow(wf([{ label: 's', type: 'subFlow', flowName: 'ghost' }]), {
      workflows: { has: () => false, hasActive: () => false },
    });
    expect(messages(errors(issues))).toContain('No workflow named "ghost"');
  });

  it('warns about duplicate labels, unclosed expressions and bad retry values', () => {
    const issues = validateWorkflow(
      wf([
        { label: 'a', type: 'logical', expression: '${x == 1' },
        { label: 'a', type: 'logical', expression: '${true}', retry: -1 },
      ]),
    );
    expect(messages(warnings(issues))).toContain('tasks[1].label: Duplicate task label "a"');
    expect(messages(errors(issues))).toContain('tasks[0].expression: SpEL syntax:');
    expect(messages(errors(issues))).toContain('tasks[1].retry: retry must be a whole number >= 0');
  });

  it('checks http tasks and accepts every template as created', async () => {
    const { TASK_TEMPLATES } = await import('./task-templates');
    const tasks = TASK_TEMPLATES.map((t, i) => t.create(`t${i}`));
    // Templates are valid as created, except the fields only the user can fill in (addresses, phone number, template id, subFlow target).
    const errs = errors(validateWorkflow(wf(tasks)));
    const byTemplate = (id: string) => errs.filter(e => e.node.startsWith(`tasks[${TASK_TEMPLATES.findIndex(t => t.id === id)}]`));
    for (const t of TASK_TEMPLATES.filter(t => !['email', 'sms', 'subFlow'].includes(t.id))) {
      expect(messages(byTemplate(t.id))).toBe('');
    }
    expect(messages(byTemplate('email'))).toContain('emailTo');
    expect(messages(byTemplate('sms'))).toContain('phoneNumber');
    expect(messages(byTemplate('subFlow'))).toContain('flowName');

    const http = (inputParameters?: unknown) =>
      validateWorkflow(wf([{ label: 'h', type: 'simple', component: 'http', ...(inputParameters ? { inputParameters } : {}) }]));
    expect(messages(errors(http()))).toContain('tasks[0].inputParameters.url: An http task needs inputParameters with a url');
    expect(messages(errors(http({ body: {} })))).toContain('tasks[0].inputParameters.url: An http task needs inputParameters.url');
    expect(messages(errors(http({ url: 'https://x', httpMethod: 'FETCH' })))).toContain('Unknown httpMethod "FETCH"');
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

  it('checks retry and retryDelay as workflow-core reads them', () => {
    const issues = validateWorkflow(
      wf([
        { label: 'a', type: 'manual', retry: -1 },
        { label: 'b', type: 'manual', retry: '3', retryDelay: 1000 },
        { label: 'c', type: 'manual', retry: 'x', retryDelay: 'soon' },
        { label: 'd', type: 'manual', retry: 2, retryDelay: '1000', retryDelayMillis: '250' },
      ]),
    );
    const text = messages(errors(issues));
    expect(text).toContain('tasks[0].retry: retry must be a whole number >= 0');
    expect(text).not.toContain('tasks[1].retry:');
    expect(text).toContain('tasks[1].retryDelay: retryDelay must be text holding milliseconds');
    expect(text).toContain('tasks[2].retry: retry must be a whole number >= 0');
    expect(text).toContain('tasks[2].retryDelay: retryDelay must be a whole number of milliseconds');
    expect(text).not.toContain('tasks[3]');
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
    const spel = validateWorkflow(wf([task({ keys: { key1: 'a', key2: 'b' }, map: "${workflow['requestContext']['routing']}" })]));
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
    expect(messages(errors(decision({ default: 'x' })))).toContain('default must be an object');
  });
});
