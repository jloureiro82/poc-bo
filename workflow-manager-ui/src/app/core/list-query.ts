import { Params } from '@angular/router';

/**
 * What the executions list shows. It lives in the URL (`?page=3&status=FAILED&name=…&id=…`), so the browser's Back
 * button, a reload and the ← link of a run all return to the same page of the list with the same filters.
 */
export interface ListQuery {
  /** Zero-based; the URL shows it one-based. */
  page: number;
  statuses: string[];
  name: string;
  id: string;
}

/** Query parameters for a list state. Defaults are left out (null drops the parameter from the URL). */
export function toListParams(q: ListQuery): Params {
  return {
    page: q.page > 0 ? q.page + 1 : null,
    status: q.statuses.length ? q.statuses.join(',') : null,
    name: q.name.trim() || null,
    id: q.id.trim() || null,
  };
}

/** Reads a list state from query parameters, ignoring values that make no sense (unknown statuses, bad pages). */
export function fromListParams(params: Params, knownStatuses: readonly string[]): ListQuery {
  const page = Number.parseInt(String(params['page'] ?? ''), 10);
  const text = (key: string) => (typeof params[key] === 'string' ? params[key].trim() : '');
  return {
    page: Number.isFinite(page) && page > 1 ? page - 1 : 0,
    statuses: text('status')
      .split(',')
      .filter((s, i, all) => knownStatuses.includes(s) && all.indexOf(s) === i),
    name: text('name'),
    id: text('id'),
  };
}

let lastParams: Params = {};

/** Remembers the list's last state, for the ← link on the run and compare pages. */
export function rememberListParams(params: Params): void {
  lastParams = { ...params };
}

export function lastListParams(): Params {
  return lastParams;
}
