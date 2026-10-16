import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { ConfigKind, ConfigurationDetails, OrchestratorEnvelope, WorkflowEnvelope } from './model';
import { SettingsService } from './settings.service';

export type AnyEnvelope = WorkflowEnvelope | OrchestratorEnvelope;

/** A stored configuration version, independent of its kind. */
export interface StoredConfig {
  kind: ConfigKind;
  name: string;
  details: ConfigurationDetails;
  body: Record<string, unknown>;
}

export const BODY_KEY: Record<ConfigKind, 'workflowConfiguration' | 'orchestratorConfiguration'> = {
  workflow: 'workflowConfiguration',
  orchestrator: 'orchestratorConfiguration',
};

/** Client for `WorkflowConfigurationController` (`/api/v1/workflow`) and `OrchestratorConfigurationController`. */
@Injectable({ providedIn: 'root' })
export class ConfigApiService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  list(kind: ConfigKind, size = 500): Observable<AnyEnvelope[]> {
    const params = new HttpParams().set('size', size).set('sort', 'id,desc');
    return this.http.get<AnyEnvelope[]>(this.base(kind), { params });
  }

  versions(kind: ConfigKind, name: string): Observable<AnyEnvelope[]> {
    return this.http.get<AnyEnvelope[]>(`${this.base(kind)}/${encodeURIComponent(name)}/versions`);
  }

  /** The active, non-deprecated version (the one the engine runs), or `null` when there is none (`404`). */
  active(kind: ConfigKind, name: string): Observable<StoredConfig | null> {
    return this.http.get<AnyEnvelope>(`${this.base(kind)}/${encodeURIComponent(name)}/active`).pipe(
      map(envelope => (envelope ? toStored(kind, envelope as unknown as Record<string, unknown>) : null)),
      catchError(e => (e instanceof HttpErrorResponse && e.status === 404 ? of(null) : throwError(() => e))),
    );
  }

  create(kind: ConfigKind, envelope: AnyEnvelope): Observable<AnyEnvelope> {
    return this.http.post<AnyEnvelope>(`${this.base(kind)}/create`, envelope);
  }

  changeState(
    kind: ConfigKind,
    name: string,
    version: number,
    action: 'activate' | 'deactivate' | 'deprecate',
  ): Observable<AnyEnvelope> {
    return this.http.patch<AnyEnvelope>(
      `${this.base(kind)}/${encodeURIComponent(name)}/versions/${version}/${action}`,
      null,
    );
  }

  private base(kind: ConfigKind): string {
    return this.settings.url(`/api/v1/${kind}`);
  }
}

export function toStored(kind: ConfigKind, envelope: Record<string, any>): StoredConfig {
  const body = (envelope[BODY_KEY[kind]] ?? {}) as Record<string, unknown>;
  const details = (envelope['configurationDetails'] ?? {}) as ConfigurationDetails;
  return { kind, details, body, name: String(details.entityName ?? body['label'] ?? '?') };
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
  }
  return lines.length ? lines : [`${error.status} ${error.statusText}`];
}
