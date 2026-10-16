import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, StoredConfig, describeHttpError } from '../../core/config-api.service';
import { queueOpen } from '../../core/drafts';
import { countBySeverity } from '../../core/issues';
import { WorkflowCatalogService } from '../../core/workflow-catalog.service';
import { validateWorkflow } from '../../core/workflow-validator';

type CheckedConfig = StoredConfig & { errors: number; warnings: number; tasks: number };

@Component({
  selector: 'app-library',
  imports: [DatePipe],
  template: `
    <div class="page">
      <header class="toolbar">
        <h1>Stored workflows <span class="muted">{{ rows().length }}</span></h1>
        <div class="toolbar-actions">
          <input class="search" placeholder="Filter by name…" [value]="filter()" (input)="filter.set($any($event.target).value)" />
          <button class="ghost" (click)="load()" [disabled]="loading()">{{ loading() ? 'Loading…' : '↻ Refresh' }}</button>
        </div>
      </header>

      @if (error().length) {
        <div class="banner error">
          @for (line of error(); track $index) { <div>{{ line }}</div> }
        </div>
      }

      <p class="muted small">
        The service lists one version per workflow: the one it runs (the highest active version whose activation date
        has passed). Each is re-validated here with the same rules as the editor.
      </p>

      <section class="card">
        <table>
          <thead>
            <tr><th>Workflow</th><th>Running version</th><th>Checks</th><th>Tasks</th><th>Activation</th><th>User</th><th>Description</th><th></th></tr>
          </thead>
          <tbody>
            @for (v of rows(); track v.name) {
              <tr>
                <td><strong>{{ v.name }}</strong></td>
                <td><span class="pill ok">v{{ v.details.version }}</span></td>
                <td>
                  @if (v.errors) { <span class="pill error">{{ v.errors }} ✖</span> }
                  @if (v.warnings) { <span class="pill warning">{{ v.warnings }} ▲</span> }
                  @if (!v.errors && !v.warnings) { <span class="pill ok">✓</span> }
                </td>
                <td>{{ v.tasks }}</td>
                <td>{{ v.details.activationDate | date: 'short' }}</td>
                <td>{{ v.details.user }}</td>
                <td class="desc">{{ v.details.description }}</td>
                <td class="row-buttons">
                  <button class="ghost" (click)="open(v)">Open</button>
                  <button class="ghost" (click)="newVersion(v)"
                          title="Open this version in the editor as the base of a new version">+ New version</button>
                  <button class="ghost danger" (click)="deprecate(v)"
                          title="Stop running this version. The service then runs the next lower active version, if there is one.">
                    Deprecate
                  </button>
                </td>
              </tr>
            } @empty {
              @if (!loading() && !error().length) {
                <tr><td colspan="8" class="muted">{{ filter() ? 'No workflow matches the filter.' : 'The service runs no workflows yet.' }}</td></tr>
              }
            }
          </tbody>
        </table>
      </section>
    </div>
  `,
})
export class Library {
  private readonly api = inject(ConfigApiService);
  private readonly router = inject(Router);
  private readonly catalog = inject(WorkflowCatalogService);

  protected readonly items = signal<StoredConfig[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string[]>([]);
  protected readonly filter = signal('');

  protected readonly rows = computed<CheckedConfig[]>(() => {
    const term = this.filter().toLowerCase();
    const context = { workflows: this.catalog.catalog() };
    return this.items()
      .filter(item => !term || item.name.toLowerCase().includes(term))
      .map(item => {
        const counts = countBySeverity(validateWorkflow(item.body, context));
        return { ...item, errors: counts.error, warnings: counts.warning, tasks: Array.isArray(item.body.tasks) ? item.body.tasks.length : 0 };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set([]);
    try {
      const [list] = await Promise.all([firstValueFrom(this.api.list()), this.catalog.refresh()]);
      this.items.set(list);
    } catch (e) {
      this.items.set([]);
      this.error.set(describeHttpError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected open(item: StoredConfig): void {
    queueOpen('workflow', item.body);
    void this.router.navigate(['/workflow']);
  }

  /** Opens the running version in the editor; publishing it there creates the next version. */
  protected newVersion(item: StoredConfig): void {
    queueOpen(
      'workflow',
      item.body,
      `New version of ${item.name}, based on v${item.details.version}. Edit, then Publish (the next version number is suggested).`,
    );
    void this.router.navigate(['/workflow']);
  }

  protected async deprecate(item: StoredConfig): Promise<void> {
    const version = item.details.version;
    if (typeof version !== 'number') {
      return;
    }
    if (!confirm(`Deprecate ${item.name} version ${version}? The service stops running it, and this cannot be undone.`)) {
      return;
    }
    try {
      await firstValueFrom(this.api.deprecate(item.name, version));
      await this.load();
    } catch (e) {
      this.error.set(describeHttpError(e));
    }
  }
}
