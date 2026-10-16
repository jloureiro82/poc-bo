import { JsonPath, pathToString } from './json-path';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  /** The field the issue is about, e.g. `stepList[0].activityList[1].workflowLabel`. */
  path: string;
  /** The step/activity/task the issue belongs to (used to highlight diagram nodes), e.g. `stepList[0]`. */
  node: string;
  message: string;
}

/** Collects issues for one document; `node` is the object being checked, `field` an optional key under it. */
export class IssueCollector {
  readonly issues: Issue[] = [];

  error(node: JsonPath, message: string, field?: string | number): void {
    this.add('error', node, message, field);
  }

  warn(node: JsonPath, message: string, field?: string | number): void {
    this.add('warning', node, message, field);
  }

  info(node: JsonPath, message: string, field?: string | number): void {
    this.add('info', node, message, field);
  }

  private add(severity: Severity, node: JsonPath, message: string, field?: string | number): void {
    this.issues.push({
      severity,
      node: pathToString(node),
      path: pathToString(field === undefined ? node : [...node, field]),
      message,
    });
  }
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/** Highest severity per node path (a node also inherits the issues of its own fields). */
export function severityByNode(issues: Issue[]): Map<string, Severity> {
  const result = new Map<string, Severity>();
  for (const issue of issues) {
    const current = result.get(issue.node);
    if (!current || RANK[issue.severity] < RANK[current]) {
      result.set(issue.node, issue.severity);
    }
  }
  return result;
}

/**
 * Highest severity of the issues about one field of `node`, or about anything inside that field (e.g. `map` covers
 * `map.a.b`). Only the node's own issues count: a child task's issues (inside `cases` or `tasks`) belong to the child.
 */
export function fieldSeverity(issues: Issue[], node: string, field: string): Severity | undefined {
  const target = pathToString(node ? [node, field] : [field]);
  let best: Severity | undefined;
  for (const issue of issues) {
    const p = issue.path;
    const inField = p === target || p.startsWith(target + '.') || p.startsWith(target + '[');
    if (issue.node === node && inField && (!best || RANK[issue.severity] < RANK[best])) {
      best = issue.severity;
    }
  }
  return best;
}

export function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    counts[issue.severity]++;
  }
  return counts;
}
