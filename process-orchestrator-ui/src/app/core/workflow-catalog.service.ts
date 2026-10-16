import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, describeHttpError, toStored } from './config-api.service';
import { WorkflowCatalog } from './orchestrator-validator';

export interface WorkflowSummary {
  label: string;
  versions: number[];
  activeVersion: number | null;
}

/**
 * The workflows stored in the service, used to check that `workflowLabel`, `cancellationActivity.label` and
 * `subFlow.flowName` point at something that exists. Validation simply skips those checks while not loaded.
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
    const byLabel = new Map(list.map(w => [w.label, w]));
    return {
      has: label => byLabel.has(label),
      hasActive: label => byLabel.get(label)?.activeVersion != null,
    };
  });

  readonly labels = computed(() => (this.workflows() ?? []).map(w => w.label).sort());

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const envelopes = await firstValueFrom(this.api.list('workflow'));
      const byLabel = new Map<string, WorkflowSummary>();
      for (const env of envelopes) {
        const stored = toStored('workflow', env);
        const summary = byLabel.get(stored.name) ?? { label: stored.name, versions: [], activeVersion: null };
        if (stored.details.version != null) {
          summary.versions.push(stored.details.version);
        }
        if (stored.details.active && !stored.details.deprecated) {
          summary.activeVersion = stored.details.version ?? null;
        }
        byLabel.set(stored.name, summary);
      }
      this.workflows.set([...byLabel.values()]);
      this.error.set(null);
    } catch (e) {
      this.workflows.set(null);
      this.error.set(describeHttpError(e).join(' '));
    } finally {
      this.loading.set(false);
    }
  }
}
