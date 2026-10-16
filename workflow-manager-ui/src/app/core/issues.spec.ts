import { describe, expect, it } from 'vitest';
import { Issue, fieldSeverity } from './issues';
import { validateWorkflow } from './workflow-validator';

const issue = (severity: Issue['severity'], node: string, path: string): Issue => ({ severity, node, path, message: 'm' });

describe('fieldSeverity', () => {
  it('matches the field itself and anything inside it', () => {
    const issues = [issue('warning', 'tasks[0]', 'tasks[0].map.a.b'), issue('error', 'tasks[0]', 'tasks[0].cases[1].key')];
    expect(fieldSeverity(issues, 'tasks[0]', 'map')).toBe('warning');
    expect(fieldSeverity(issues, 'tasks[0]', 'cases')).toBe('error');
    expect(fieldSeverity(issues, 'tasks[0]', 'cases[1].key')).toBe('error');
    expect(fieldSeverity(issues, 'tasks[0]', 'cases[0].key')).toBeUndefined();
  });

  it('does not match a field that only shares a prefix', () => {
    expect(fieldSeverity([issue('error', 'tasks[0]', 'tasks[0].labelText')], 'tasks[0]', 'label')).toBeUndefined();
  });

  it('keeps the highest severity', () => {
    const issues = [issue('info', '', 'label'), issue('error', '', 'label'), issue('warning', '', 'label')];
    expect(fieldSeverity(issues, '', 'label')).toBe('error');
  });

  it('ignores the issues of child tasks inside the field', () => {
    const issues = [issue('error', 'tasks[0].cases[0].tasks[0]', 'tasks[0].cases[0].tasks[0].label')];
    expect(fieldSeverity(issues, 'tasks[0]', 'cases')).toBeUndefined();
    expect(fieldSeverity(issues, 'tasks[0].cases[0].tasks[0]', 'label')).toBe('error');
  });

  it('finds the root fields of a document', () => {
    expect(fieldSeverity(validateWorkflow({ tasks: [] }, {}), '', 'name')).toBe('error');
  });

  it('points a missing http inputParameters at the URL box', () => {
    const issues = validateWorkflow({ label: 'w', tasks: [{ label: 'a', type: 'simple', component: 'http' }] }, {});
    expect(fieldSeverity(issues, 'tasks[0]', 'inputParameters.url')).toBe('error');
  });
});
