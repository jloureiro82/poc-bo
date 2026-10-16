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

  it('reads an input that is not wrapped', () => {
    expect(reusableInput({ workflowId: 'w', a: 1 })).toEqual({ a: 1 });
    expect(reusableInput(null)).toEqual({});
  });
});
