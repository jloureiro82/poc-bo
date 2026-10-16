import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { ConfigurationDetails, WorkflowDefinition, WorkflowEnvelope } from './model';
import { SettingsService } from './settings.service';

/** A stored workflow version. */
export interface StoredConfig {
  name: string;
  details: ConfigurationDetails;
  body: WorkflowDefinition;
}

/** `Constants.ENTITY_WORKFLOW`: the entity type of workflow definitions in the deployment endpoints. */
const ENTITY_TYPE = 'WORKFLOW';

/**
 * Client for workflow-manager's configuration endpoints: `WorkflowConfigurationResource` (create) and
 * `EntityConfigurationController` (`/api/v1/deployment`: list, read and deprecate).
 *
 * The service only ever hands out the version it **runs** for each workflow: the highest version that is active, not
 * deprecated, and whose activation date has passed. Other versions cannot be listed or re-activated through the API.
 */
@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  /** The running version of every workflow. */
  list(): Observable<StoredConfig[]> {
    const params = new HttpParams().set('size', 2000);
    return this.http
      .get<unknown[]>(this.deployment(`/entity-type/${ENTITY_TYPE}`), { params })
      .pipe(map(list => (Array.isArray(list) ? list.map(toStored) : [])));
  }

  /** The running version of one workflow, or `null` when it has none (the service answers 500 "Entity Not Found"). */
  running(name: string): Observable<StoredConfig | null> {
    return this.http.get<unknown>(this.deployment(`/entity-type/${ENTITY_TYPE}/entity-name/${encodeURIComponent(name)}`)).pipe(
      map(entity => (entity ? toStored(entity) : null)),
      catchError(error => (isNotFound(error) ? of(null) : throwError(() => error))),
    );
  }

  create(envelope: WorkflowEnvelope): Observable<WorkflowEnvelope> {
    return this.http.post<WorkflowEnvelope>(this.settings.url('/api/v1/configuration/business-logic/entity-type/workflow'), envelope);
  }

  /** Deprecates one version. It cannot be undone through the API. */
  deprecate(name: string, version: number): Observable<unknown> {
    return this.http.post(
      this.deployment(`/deprecate/entity-type/${ENTITY_TYPE}/entity-name/${encodeURIComponent(name)}/version/${version}`),
      null,
    );
  }

  /** Deprecates every active version of a workflow, so it can no longer run. */
  deprecateAll(name: string): Observable<unknown> {
    return this.http.post(this.deployment(`/deprecate/entity-type/${ENTITY_TYPE}/entity-name/${encodeURIComponent(name)}`), null);
  }

  private deployment(path: string): string {
    return this.settings.url(`/api/v1/deployment${path}`);
  }
}

/**
 * Turns an `EntityConfigurationDTO` into a stored version. The definition arrives as JSON text in `payload`, written
 * by the service with every key it knows, most of them `null`. Those nulls mean "absent" to the engine and are left
 * out here, so an opened version looks like what was published.
 */
export function toStored(entity: unknown): StoredConfig {
  const e = (entity && typeof entity === 'object' ? entity : {}) as Record<string, unknown>;
  let body: WorkflowDefinition = {};
  try {
    const parsed = typeof e['payload'] === 'string' ? JSON.parse(e['payload']) : e['payload'];
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== null));
    }
  } catch {
    // an unreadable payload shows as an empty definition, which validation then reports
  }
  const { payload: _payload, ...details } = e;
  return { name: String(e['entityName'] ?? body.name ?? '?'), details: details as ConfigurationDetails, body };
}

/** `EntityConfigurationApiService` throws `EntityNotFoundException`, which reaches the client as a 500. */
function isNotFound(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 500 && String(error.error?.detail ?? '').includes('Entity Not Found');
}

/** Turns an HTTP failure (RFC 7807 problem details from `ExceptionTranslator`) into readable lines. */
export function describeHttpError(error: unknown): string[] {
  if (!(error instanceof HttpErrorResponse)) {
    return [String(error)];
  }
  if (error.status === 0) {
    return ['Cannot reach the service. Is it running, and is the base URL / dev proxy right?'];
  }
  if (error.status === 401) {
    return ['401 Unauthorized: set a valid JWT in Settings.'];
  }
  if (error.status === 403) {
    return ['403 Forbidden: the JWT lacks the required authority.'];
  }
  if (error.status === 404 && !error.error) {
    return ['404 Not Found with no body: another application may be using the service port.'];
  }
  const body = error.error;
  const lines: string[] = [];
  if (body && typeof body === 'object') {
    const head = [body.title, body.detail].filter(Boolean).join(': ');
    if (head) {
      lines.push(`${error.status} ${head}`);
    }
    if (Array.isArray(body.fieldErrors)) {
      for (const fe of body.fieldErrors) {
        lines.push(`${fe.objectName ?? ''}.${fe.field ?? ''}: ${fe.message ?? ''}`);
      }
    }
    if (body.message && !head.includes(body.message)) {
      lines.push(String(body.message));
    }
    if (String(body.detail ?? '').includes('is not a valid HTTP URL')) {
      lines.push(
        'This build of the service cannot list executions on /api/v1/execution/workflow. The fix is in v1/WorkflowExecutionResource.getAllWorkflow; the list works once a build with it is deployed.',
      );
    }
  } else if (typeof body === 'string' && body.trim()) {
    lines.push(`${error.status} ${body.trim().slice(0, 300)}`);
  }
  return lines.length ? lines : [`${error.status} ${error.statusText}`];
}
