import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { ActivityRun, FlowTrace, StepTrace, TaskRun, WorkflowRun } from './executions';
import { SettingsService } from './settings.service';

export interface FlowPage {
  items: FlowTrace[];
  total: number;
}

/** Body of `POST /api/v1/orchestrator/execution/workflow/start` (`ExecutionStartRequestAPI`). */
export interface StartRequest {
  orchestrationFlow: string;
  owner?: string;
  channel?: string;
  requestContext?: Record<string, unknown>;
}

/** `ExecutionResponseAPI`: `code` is the result of the flow's first activity, when it ran one. */
export interface StartResponse {
  orchestrationId: string;
  code?: string | null;
  description?: string | null;
  responseContext?: Record<string, unknown> | null;
  /** Where the flow stands: `complete` once it ran to its end. */
  flowDefinitionAPI?: { label?: string; complete?: boolean; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface FlowQuery {
  page: number;
  size: number;
  statuses: string[];
  flowName: string;
  orchestratorId: string;
}

/** Read-only access to the execution trace resources (JHipster criteria filters: `field.equals`, `.in`, `.contains`). */
@Injectable({ providedIn: 'root' })
export class ExecutionsApiService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  flows(query: FlowQuery): Observable<FlowPage> {
    let params = new HttpParams().set('page', query.page).set('size', query.size).set('sort', 'id,desc');
    if (query.statuses.length) {
      params = params.set('flowStatus.in', query.statuses.join(','));
    }
    if (query.flowName.trim()) {
      params = params.set('flowName.contains', query.flowName.trim());
    }
    if (query.orchestratorId.trim()) {
      params = params.set('orchestratorId.contains', query.orchestratorId.trim());
    }
    return this.http
      .get<FlowTrace[]>(this.url('flow-traces'), { params, observe: 'response' })
      .pipe(map(r => ({ items: r.body ?? [], total: Number(r.headers.get('X-Total-Count') ?? r.body?.length ?? 0) })));
  }

  flow(orchestratorId: string): Observable<FlowTrace | null> {
    return this.list<FlowTrace>('flow-traces', { 'orchestratorId.equals': orchestratorId }).pipe(map(l => l[0] ?? null));
  }

  steps(orchestratorId: string): Observable<StepTrace[]> {
    return this.list<StepTrace>('step-traces', { 'orchestratorId.equals': orchestratorId, sort: 'id,asc' });
  }

  activityRuns(orchestratorId: string): Observable<ActivityRun[]> {
    return this.list<ActivityRun>('orchestrator-execution-traces', { 'orchestratorId.equals': orchestratorId, sort: 'id,asc' });
  }

  workflows(workflowIds: string[]): Observable<WorkflowRun[]> {
    return workflowIds.length
      ? this.list<WorkflowRun>('entity-workflow-executions', { 'workflowId.in': workflowIds.join(','), sort: 'id,asc' })
      : of([]);
  }

  tasks(workflowIds: string[]): Observable<TaskRun[]> {
    return workflowIds.length
      ? this.list<TaskRun>('entity-task-executions', { 'workflowId.in': workflowIds.join(','), sort: 'id,asc', size: '2000' })
      : of([]);
  }

  /** The latest flows of one orchestrator (exact name), newest first; optionally only those started from `since` on. */
  latest(flowName: string, size: number, since?: string): Observable<FlowTrace[]> {
    const filters: Record<string, string> = { 'flowName.equals': flowName, sort: 'id,desc', size: String(size) };
    if (since) {
      filters['startDate.greaterThanOrEqual'] = since;
    }
    return this.list<FlowTrace>('flow-traces', filters);
  }

  /** The activity runs of several flows, in one call. */
  activityRunsOf(orchestratorIds: string[]): Observable<ActivityRun[]> {
    return orchestratorIds.length
      ? this.list<ActivityRun>('orchestrator-execution-traces', { 'orchestratorId.in': orchestratorIds.join(','), sort: 'id,asc', size: '2000' })
      : of([]);
  }

  /** The FAILED workflow executions among some activity runs, in one call. */
  failedWorkflows(workflowIds: string[]): Observable<WorkflowRun[]> {
    return workflowIds.length
      ? this.list<WorkflowRun>('entity-workflow-executions', { 'workflowId.in': workflowIds.join(','), 'status.equals': 'FAILED', size: '2000' })
      : of([]);
  }

  /**
   * Starts a flow of the active version of an orchestrator (`OrchestratorExecutionController.startExecution`).
   * The answer names the new flow (`orchestrationId`) and, when the first activity is automatic, says how it went.
   */
  start(request: StartRequest): Observable<StartResponse> {
    return this.http.post<StartResponse>(this.settings.url('/api/v1/orchestrator/execution/workflow/start'), request);
  }

  private list<T>(resource: string, filters: Record<string, string>): Observable<T[]> {
    let params = new HttpParams().set('size', '1000');
    for (const [k, v] of Object.entries(filters)) {
      params = params.set(k, v);
    }
    return this.http.get<T[]>(this.url(resource), { params });
  }

  private url(resource: string): string {
    return this.settings.url(`/api/v1/${resource}`);
  }
}
