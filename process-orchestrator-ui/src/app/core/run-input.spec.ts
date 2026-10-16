import { loadRunInput, requestContextSkeleton, saveRunInput, startInputOf, workflowLabelsOf, workflowReferences } from './run-input';

describe('workflowReferences', () => {
  it('reads dotted and bracketed paths, and stops at method calls', () => {
    expect(workflowReferences("${workflow.email} ${workflow['requestContext']['type']} ${workflow[\"a\"].b} ${workflow.items.size()}")).toEqual([
      ['email'],
      ['requestContext', 'type'],
      ['a', 'b'],
      ['items'],
    ]);
  });

  it('ignores other variables', () => {
    expect(workflowReferences('${myworkflow.x} ${execution.workflow.x} workflow')).toEqual([]);
  });
});

describe('requestContextSkeleton', () => {
  it('nests what the workflows read under requestContext, with lists for `for` tasks', () => {
    const a = {
      label: 'a',
      tasks: [
        { label: 't', type: 'simple', component: 'logical', expression: "${workflow['requestContext']['customer']['email'] != null && workflow.staticVariables.x}" },
        { label: 'f', type: 'for', list: "${workflow['requestContext']['items']}", tasks: [] },
      ],
    };
    const b = { label: 'b', tasks: [{ label: 'u', type: 'simple', component: 'logical', expression: '${workflow.requestContext.customer.id > 0}' }] };
    expect(requestContextSkeleton([a, b])).toEqual({ customer: { email: '', id: '' }, items: [] });
  });

  it('is empty when nothing reads the request context', () => {
    expect(requestContextSkeleton([{ tasks: [] }])).toEqual({});
  });
});

describe('workflowLabelsOf', () => {
  it('lists the workflows of every activity, cancellations included, once each', () => {
    const config = {
      stepList: [
        { label: 's1', activityList: [{ label: 'a', workflowLabel: 'wa', cancellationActivity: { active: true, label: 'undo' } }] },
        { label: 's2', activityList: [{ label: 'b', workflowLabel: 'wa' }, { label: 'c', workflowLabel: '' }] },
      ],
    };
    expect(workflowLabelsOf(config)).toEqual(['wa', 'undo']);
  });
});

describe('remembered input', () => {
  beforeEach(() => localStorage.clear());

  it('is kept per flow', () => {
    saveRunInput('f', { owner: 'me', requestContext: { a: 1 } });
    expect(loadRunInput('f')).toEqual({ owner: 'me', requestContext: { a: 1 } });
    expect(loadRunInput('g')).toBeNull();
  });
});

describe('startInputOf', () => {
  it('reads the start request the first activity run recorded', () => {
    const input = { owner: 'me', orchestrationFlow: 'f', channel: 'web', requestContext: { amount: 5 }, orchestrationId: 'x' };
    expect(startInputOf(input)).toEqual({ owner: 'me', channel: 'web', requestContext: { amount: 5 } });
  });

  it('takes an input without requestContext as the context, minus what the service adds', () => {
    expect(startInputOf({ orchestrationId: 'x', orchestrationFlow: 'f', amount: 1 })).toEqual({ requestContext: { amount: 1 } });
    expect(startInputOf(null)).toEqual({ requestContext: {} });
  });
});
