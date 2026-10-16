import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError } from './config-api.service';
import { WorkflowCatalog } from './workflow-validator';

export interface WorkflowSummary {
  name: string;
  /** The version the service runs. It lists no other versions. */
  runningVersion: number | null;
}

/**
 * The workflows the service runs, used to check that `failureWorkflowId` and `rejectionWorkflowId` point at
 * something that can start. Validation simply skips those checks while not loaded.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowCatalogService {
  private readonly api = inject(ConfigApiService);

  readonly workflows = signal<WorkflowSummary[] | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly catalog = computed<WorkflowCatalog | undefined>(() => {
    const list = this.workflows();
    if (!list) {
      return undefined;
    }
    const names = new Set(list.map(w => w.name));
    return { has: name => names.has(name) };
  });

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const stored = await firstValueFrom(this.api.list());
      const byName = new Map<string, WorkflowSummary>();
      for (const item of stored) {
        byName.set(item.name, { name: item.name, runningVersion: item.details.version ?? null });
      }
      this.workflows.set([...byName.values()]);
      this.error.set(null);
    } catch (e) {
      this.workflows.set(null);
      this.error.set(describeHttpError(e).join(' '));
    } finally {
      this.loading.set(false);
    }
  }
}
