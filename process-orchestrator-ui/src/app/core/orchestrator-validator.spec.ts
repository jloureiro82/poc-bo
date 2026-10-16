import { Issue } from './issues';
import { WorkflowCatalog, isPositiveIsoDuration, validateOrchestrator } from './orchestrator-validator';
import { sampleOrchestrator } from './samples';

const errors = (issues: Issue[]) => issues.filter(i => i.severity === 'error');
const warnings = (issues: Issue[]) => issues.filter(i => i.severity === 'warning');
const messages = (issues: Issue[]) => issues.map(i => `${i.path}: ${i.message}`).join('\n');

function flow(steps: unknown[]): Record<string, unknown> {
  return { label: 'f', stepList: steps };
}

const catalog: WorkflowCatalog = {
  has: l => ['wf', 'inactive', 'undoHandle', 'logicalSuccess'].includes(l),
  hasActive: l => l !== 'inactive',
};

describe('validateOrchestrator', () => {
  it('accepts the sample configuration', () => {
    const issues = validateOrchestrator(sampleOrchestrator(), { workflows: catalog });
    expect(messages(errors(issues))).toBe('');
    expect(messages(warnings(issues))).toBe('');
  });

  it('mirrors the server rules: label and at least one step', () => {
    expect(messages(validateOrchestrator({ stepList: [] }))).toContain('label: Label is required');
    expect(messages(validateOrchestrator({ label: 'x' }))).toContain('stepList: At least one step is required');
    expect(errors(validateOrchestrator('nope'))).toHaveLength(1);
  });

  it('mirrors the server failure-policy rules', () => {
    const bad = (activity: Record<string, unknown>) =>
      messages(errors(validateOrchestrator(flow([{ label: 's', activityList: [{ label: 'a', workflowLabel: 'wf', ...activity }] }]))));

    expect(bad({ onFailure: 'hold' })).toContain('onFailure must be an object');
    expect(bad({ onFailure: { action: 'retry' } })).toContain('onFailure.action must be one of fail, hold, cancel');
    expect(bad({ onFailure: { action: 'cancel' } })).toContain('needs an active cancellationActivity with a label');
    expect(bad({ onFailure: { action: 'cancel' }, cancellationActivity: { active: false, label: 'x' } })).toContain(
      'needs an active cancellationActivity',
    );
    expect(bad({ onFailure: { action: 'cancel' }, cancellationActivity: { active: true, label: 'x' } })).toBe('');
    expect(bad({ onFailure: { action: 'hold' } })).toBe('');
  });

  it('mirrors the backend rules for the hold timeout', () => {
    const bad = (activity: Record<string, unknown>) =>
      messages(errors(validateOrchestrator(flow([{ label: 's', activityList: [{ label: 'a', workflowLabel: 'wf', ...activity }] }]))));
    const cancellable = { cancellationActivity: { active: true, label: 'undo' } };

    expect(bad({ onFailure: { action: 'hold', holdTimeout: 'PT24H' } })).toBe('');
    expect(bad({ onFailure: { action: 'hold', holdTimeout: 'P2DT3H', onTimeout: 'fail' } })).toBe('');
    expect(bad({ onFailure: { action: 'hold', holdTimeout: 'PT30M', onTimeout: 'cancel' }, ...cancellable })).toBe('');

    expect(bad({ onFailure: { action: 'fail', holdTimeout: 'PT1H' } })).toContain('holdTimeout is only allowed with action "hold"');
    expect(bad({ onFailure: { action: 'hold', holdTimeout: '24h' } })).toContain('positive ISO-8601 duration');
    expect(bad({ onFailure: { action: 'hold', holdTimeout: 'PT0S' } })).toContain('positive ISO-8601 duration');
    expect(bad({ onFailure: { action: 'hold', holdTimeout: 3600 } })).toContain('positive ISO-8601 duration');
    expect(bad({ onFailure: { action: 'hold', onTimeout: 'fail' } })).toContain('onTimeout needs a holdTimeout');
    expect(bad({ onFailure: { action: 'hold', holdTimeout: 'PT1H', onTimeout: 'hold' } })).toContain(
      'onTimeout must be one of fail, cancel',
    );
    expect(bad({ onFailure: { action: 'hold', holdTimeout: 'PT1H', onTimeout: 'cancel' } })).toContain(
      'onTimeout "cancel" needs an active cancellationActivity',
    );
  });

  it('accepts the ISO-8601 durations Java Duration.parse accepts, when positive', () => {
    for (const ok of ['PT24H', 'pt15m', 'P1D', 'P1DT2H3M4S', 'PT0.5S', 'PT1,5S', 'PT-1H90M', '-PT-1H']) {
      expect(isPositiveIsoDuration(ok), ok).toBe(true);
    }
    for (const no of ['', 'P', 'PT', 'P1DT', 'P1M', 'P1Y', 'PT0S', '-PT1H', 'PT1H-', '24h', '1 day']) {
      expect(isPositiveIsoDuration(no), no).toBe(false);
    }
  });

  it('requires exactly one reachable entry step', () => {
    const noEntry = validateOrchestrator(
      flow([
        { label: 'a', previousStep: ['b'], activityList: [{ label: 'x', workflowLabel: 'wf' }] },
        { label: 'b', previousStep: ['a'], activityList: [{ label: 'x', workflowLabel: 'wf' }] },
      ]),
    );
    expect(messages(errors(noEntry))).toContain('No entry step');
    expect(messages(errors(noEntry))).toContain('part of a cycle');

    const twoEntries = validateOrchestrator(
      flow([
        { label: 'a', activityList: [{ label: 'x', workflowLabel: 'wf' }] },
        { label: 'b', activityList: [{ label: 'x', workflowLabel: 'wf' }] },
      ]),
    );
    expect(errors(twoEntries)).toHaveLength(0);
    expect(warnings(twoEntries)[0].path).toBe('stepList[1].previousStep');
    expect(warnings(twoEntries)[0].message).toContain('("a")');
  });

  it('flags broken previousStep references, empty lists and self links', () => {
    const issues = validateOrchestrator(
      flow([
        { label: 'a', activityList: [{ label: 'x', workflowLabel: 'wf' }] },
        { label: 'b', previousStep: ['ghost'], activityList: [{ label: 'x', workflowLabel: 'wf' }] },
        { label: 'c', previousStep: [], activityList: [{ label: 'x', workflowLabel: 'wf' }] },
        { label: 'd', previousStep: 'a', activityList: [{ label: 'x', workflowLabel: 'wf' }] },
        { label: 'e', previousStep: ['e'], activityList: [{ label: 'x', workflowLabel: 'wf' }] },
      ]),
    );
    const text = messages(errors(issues));
    expect(text).toContain('stepList[1].previousStep: previousStep refers to unknown step "ghost"');
    expect(text).toContain('stepList[2].previousStep: previousStep is an empty list');
    expect(text).toContain('stepList[3].previousStep: previousStep must be a list');
    expect(text).toContain('stepList[4].previousStep: A step cannot be its own predecessor');
  });

  it('checks labels: required and unique', () => {
    const issues = validateOrchestrator(
      flow([
        { label: 'a', activityList: [{ label: 'x', workflowLabel: 'wf' }, { previousActivity: ['x'], workflowLabel: 'wf' }] },
        { label: 'a', previousStep: ['a'], activityList: [{ label: 'x', workflowLabel: 'wf' }] },
      ]),
    );
    const text = messages(errors(issues));
    expect(text).toContain('stepList[1].label: Duplicate step label "a"');
    expect(text).toContain('stepList[0].activityList[1].label: Every activity needs a non-blank label');
  });

  it('requires activities with a workflow, and an entry activity per step', () => {
    const issues = validateOrchestrator(
      flow([
        { label: 'a' },
        { label: 'b', previousStep: ['a'], activityList: [{ label: 'x', previousActivity: ['y'] }, { label: 'y', previousActivity: ['x'] }] },
      ]),
    );
    const text = messages(errors(issues));
    expect(text).toContain('stepList[0].activityList: The step has no activities');
    expect(text).toContain('stepList[1].activityList[0].workflowLabel: workflowLabel is required');
    expect(text).toContain('stepList[1]: No entry activity');
  });

  it('lets manual activities have several paths, but keeps automatic ones 1 to 1', () => {
    const step = (activityList: unknown[]) => validateOrchestrator(flow([{ label: 's', activityList }]));

    // manual fork and manual join: fine
    const manual = step([
      { label: 'a', workflowLabel: 'wf' },
      { label: 'b', previousActivity: ['a'], workflowLabel: 'wf' },
      { label: 'c', previousActivity: ['a'], workflowLabel: 'wf' },
      { label: 'd', previousActivity: ['b', 'c'], workflowLabel: 'wf' },
    ]);
    expect(messages(errors(manual))).toBe('');

    // automatic with two predecessors: error on the automatic one
    const autoJoin = step([
      { label: 'a', workflowLabel: 'wf' },
      { label: 'b', previousActivity: ['a'], workflowLabel: 'wf' },
      { label: 'c', previousActivity: ['a', 'b'], type: 'automatic', workflowLabel: 'wf' },
    ]);
    expect(messages(errors(autoJoin))).toContain(
      'stepList[0].activityList[2].previousActivity: An automatic activity must follow exactly one activity (1 to 1)',
    );

    // automatic beside another option (manual or automatic): error on the predecessor
    for (const other of ['manual', 'automatic']) {
      const fork = step([
        { label: 'a', workflowLabel: 'wf' },
        { label: 'b', previousActivity: ['a'], type: 'automatic', workflowLabel: 'wf' },
        { label: 'c', previousActivity: ['a'], type: other, workflowLabel: 'wf' },
      ]);
      const errs = errors(fork);
      expect(errs).toHaveLength(1);
      expect(errs[0].node).toBe('stepList[0].activityList[0]');
      expect(errs[0].message).toContain('must be the only activity after this one (1 to 1)');
    }

    // a plain automatic chain is fine
    expect(
      errors(
        step([
          { label: 'a', workflowLabel: 'wf' },
          { label: 'b', previousActivity: ['a'], type: 'automatic', workflowLabel: 'wf' },
          { label: 'c', previousActivity: ['b'], type: 'automatic', workflowLabel: 'wf' },
        ]),
      ),
    ).toHaveLength(0);
  });

  it('applies the same rules to steps', () => {
    const steps = (step3Type?: string) =>
      validateOrchestrator(
        flow([
          { label: 'main', activityList: [{ label: 'x', workflowLabel: 'wf' }] },
          { label: 'step2', previousStep: ['main'], activityList: [{ label: 'x', workflowLabel: 'wf' }] },
          {
            label: 'step3',
            previousStep: ['step2', 'main'],
            ...(step3Type ? { type: step3Type } : {}),
            activityList: [{ label: 'x', workflowLabel: 'wf' }],
          },
        ]),
      );
    // The failureCancelFlow example: a manual step with two paths is fine
    expect(messages(errors(steps()))).toBe('');
    const auto = messages(errors(steps('automatic')));
    expect(auto).toContain('stepList[2].previousStep: An automatic step must follow exactly one step');
    expect(auto).toContain('stepList[0]: "step3" is automatic, so it must be the only step after this one');
  });

  it('checks workflow references only when the catalog is known', () => {
    const config = flow([
      {
        label: 's',
        activityList: [
          { label: 'a', workflowLabel: 'missing' },
          { label: 'b', previousActivity: ['a'], workflowLabel: 'inactive', cancellationActivity: { active: true, label: 'gone' } },
        ],
      },
    ]);
    expect(errors(validateOrchestrator(config))).toHaveLength(0);

    const issues = validateOrchestrator(config, { workflows: catalog });
    expect(messages(errors(issues))).toContain('workflowLabel: No workflow named "missing"');
    expect(messages(errors(issues))).toContain('cancellationActivity.label: No workflow named "gone"');
    expect(messages(warnings(issues))).toContain('Workflow "inactive" has no active version');
  });

  it('rejects wrongly typed values the backend would fail to cast', () => {
    const issues = validateOrchestrator({
      label: 'f',
      staticVariables: ['x'],
      stepList: [{ label: 's', sync: 'yes', activityList: [{ label: 'a', workflowLabel: 'wf', staticVariables: 'x' }] }],
    });
    const text = messages(errors(issues));
    expect(text).toContain('staticVariables: staticVariables must be a JSON object');
    expect(text).toContain('stepList[0].sync: sync must be true or false');
    expect(text).toContain('stepList[0].activityList[0].staticVariables');
  });

  it('anchors every issue to its step or activity node', () => {
    const issues = validateOrchestrator(
      flow([{ label: 's', activityList: [{ label: 'a', workflowLabel: 'wf', cancellationActivity: { active: 'y' } }] }]),
    );
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.node).toBe('stepList[0].activityList[0]');
    }
  });
});
