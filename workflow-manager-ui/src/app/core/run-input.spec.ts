import { inputSkeleton, reusableInput, workflowReferences } from './run-input';

describe('workflowReferences', () => {
  it('reads dotted and bracketed paths, and stops at method calls', () => {
    expect(workflowReferences("${workflow.email} ${workflow['type']} ${workflow[\"a\"].b} ${workflow.items.size()}")).toEqual([
      ['email'],
      ['type'],
      ['a', 'b'],
      ['items'],
    ]);
  });

  it('ignores other variables and the id the service adds', () => {
    expect(workflowReferences('${myworkflow.x} ${execution.workflow.x} ${workflow.workflowId} workflow')).toEqual([]);
  });
});

describe('inputSkeleton', () => {
  it('nests the referenced paths, with lists for `for` tasks', () => {
    const definition = {
      name: 'w',
      tasks: [
        { label: 'a', type: 'simple', component: 'logical', expression: "${workflow.customer.email != null && workflow['type'] == 'x'}" },
        { label: 'f', type: 'for', list: "${workflow['items']}", tasks: [{ label: 'b', type: 'simple', component: 'logical', expression: '${workflow.customer.id > 0}' }] },
      ],
    };
    expect(inputSkeleton(definition)).toEqual({ customer: { email: '', id: '' }, type: '', items: [] });
  });

  it('is empty for a workflow that reads no input', () => {
    expect(inputSkeleton({ tasks: [] })).toEqual({});
  });
});

describe('reusableInput', () => {
  it('unwraps the request body the service keeps under `workflow`, without the id it added', () => {
    expect(reusableInput({ workflow: { amount: 0, type: 'b', workflowId: 'uiCheckFlow' } })).toEqual({ amount: 0, type: 'b' });
  });

  it('drops every key the service set, and keeps the rest of the body as it was', () => {
    const inputs = { workflow: { workflowId: 'w', parentTaskExecutionId: 'p', transactionId: 't', tags: ['x'], customer: { id: 1 } } };
    expect(reusableInput(inputs)).toEqual({ tags: ['x'], customer: { id: 1 } });
  });

  it('only reads the workflow body: other stored keys never reach the new run', () => {
    expect(reusableInput({ workflow: { a: 1 }, context: { stackId: 's' } })).toEqual({ a: 1 });
    expect(reusableInput({ workflowId: 'w', a: 1 })).toEqual({});
    expect(reusableInput({ workflow: 'not an object' })).toEqual({});
    expect(reusableInput(null)).toEqual({});
  });
});
