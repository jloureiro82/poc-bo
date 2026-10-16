import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { TaskRun, WorkflowRun, toTaskRun, toWorkflowRun } from './executions';
import { SettingsService } from './settings.service';

export interface RunPage {
  items: WorkflowRun[];
  total: number;
}

export interface RunQuery {
  page: number;
  size: number;
  statuses: string[];
  name: string;
  workflowId: string;
}

/**
 * The execution history, and retrying a run, through the engine's own resources under `/api/v1/execution`
 * (`v1.WorkflowExecutionResource`, `v1.TaskExecutionResource`). The lists take JHipster criteria filters
 * (`field.equals`, `.in`, `.contains`) and return `X-Total-Count`.
 *
 * Builds of the service from before the fix to `v1.WorkflowExecutionResource.getAllWorkflow` answer the workflow list
 * with `500 "[/workflow] is not a valid HTTP URL"`. `describeHttpError` explains that error; there is no fallback
 * to another endpoint.
 */
@Injectable({ providedIn: 'root' })
export class ExecutionsApiService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  runs(query: RunQuery): Observable<RunPage> {
    let params = new HttpParams().set('page', query.page).set('size', query.size).set('sort', 'id,desc');
    if (query.statuses.length) {
      params = params.set('status.in', query.statuses.join(','));
    }
    if (query.name.trim()) {
      // the workflow name is stored in the `label` column (`WorkflowMapper`: name <-> label)
      params = params.set('label.contains', query.name.trim());
    }
    if (query.workflowId.trim()) {
      params = params.set('workflowId.contains', query.workflowId.trim());
    }
    return this.http.get<unknown[]>(this.settings.url('/api/v1/execution/workflow'), { params, observe: 'response' }).pipe(
      map(r => ({
        items: (r.body ?? []).map(toWorkflowRun),
        total: Number(r.headers.get('X-Total-Count') ?? r.body?.length ?? 0),
      })),
    );
  }

  /** One execution, or `null`: the service answers 200 with an empty body for an unknown id. */
  run(workflowId: string): Observable<WorkflowRun | null> {
    return this.http
      .get<unknown>(this.settings.url(`/api/v1/execution/workflow/workflowid/${encodeURIComponent(workflowId)}`))
      .pipe(map(body => (body && typeof body === 'object' ? toWorkflowRun(body) : null)));
  }

  /**
   * Retries a failed or stopped run: the service continues the same run from where it stopped
   * (`POST …/workflow/{id}/retry`, `WorkflowService.resume`). It answers 204, or 429 when it runs too many workflows.
   */
  retry(workflowId: string): Observable<void> {
    return this.http.post<void>(this.settings.url(`/api/v1/execution/workflow/${encodeURIComponent(workflowId)}/retry`), {});
  }

  tasks(workflowId: string): Observable<TaskRun[]> {
    const params = new HttpParams().set('workflowId.equals', workflowId).set('sort', 'id,asc').set('size', 2000);
    return this.http.get<unknown[]>(this.settings.url('/api/v1/execution/tasks'), { params }).pipe(map(l => (l ?? []).map(toTaskRun)));
  }

  /** The latest runs of one workflow (exact name), newest first; optionally only those created from `since` on. */
  latest(name: string, size: number, since?: string): Observable<WorkflowRun[]> {
    let params = new HttpParams().set('label.equals', name).set('page', 0).set('size', size).set('sort', 'id,desc');
    if (since) {
      params = params.set('createTime.greaterThanOrEqual', since);
    }
    return this.http.get<unknown[]>(this.settings.url('/api/v1/execution/workflow'), { params }).pipe(map(l => (l ?? []).map(toWorkflowRun)));
  }

  /** The FAILED task executions of some runs, in one call. */
  failedTasks(workflowIds: string[]): Observable<TaskRun[]> {
    if (!workflowIds.length) {
      return of([]);
    }
    const params = new HttpParams().set('workflowId.in', workflowIds.join(',')).set('status.equals', 'FAILED').set('size', 2000);
    return this.http.get<unknown[]>(this.settings.url('/api/v1/execution/tasks'), { params }).pipe(map(l => (l ?? []).map(toTaskRun)));
  }

  /**
   * Starts a run of the running version of `name` (`v1.WorkflowExecutionResource.runWorkflow`) with `input` as the
   * workflow input. A `sync` workflow answers when the run ends: 200, 400 when it failed, or the `httpCode` its
   * outputs set, with the run's `workflowId`, `status`, `errorList` and `output` (or just `output.body` when the
   * outputs have one). Other messengers answer 202 with an empty body.
   */
  start(name: string, input: Record<string, unknown>): Observable<HttpResponse<unknown>> {
    return this.http.post<unknown>(this.settings.url(`/api/v1/execution/workflow/${encodeURIComponent(name)}/run`), input, { observe: 'response' });
  }
}
