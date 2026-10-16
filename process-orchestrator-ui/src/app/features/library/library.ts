import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfigApiService, StoredConfig, describeHttpError, toStored } from '../../core/config-api.service';
import { queueOpen } from '../../core/drafts';
import { countBySeverity } from '../../core/issues';
import { ConfigKind } from '../../core/model';
import { validateOrchestrator } from '../../core/orchestrator-validator';
import { WorkflowCatalogService } from '../../core/workflow-catalog.service';
import { validateWorkflow } from '../../core/workflow-validator';

type CheckedConfig = StoredConfig & { errors: number; warnings: number };

interface Group {
  name: string;
  versions: CheckedConfig[];
  /** The version the engine runs (active and not deprecated), if any. */
  active: CheckedConfig | null;
  /** Every other version, newest first. */
  others: CheckedConfig[];
}

@Component({
  selector: 'app-library',
  imports: [DatePipe, NgTemplateOutlet],
  template: `
    <div class="page">
      <header class="toolbar">
        <h1>Stored configurations</h1>
        <div class="toolbar-actions">
          <div class="tabs inline">
            <button [class.active]="kind() === 'orchestrator'" (click)="switchKind('orchestrator')">Orchestrators</button>
            <button [class.active]="kind() === 'workflow'" (click)="switchKind('workflow')">Workflows</button>
          </div>
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
        Every stored version is re-validated here with the same rules as the editor, so configurations that were
        saved before these checks existed show up too.
      </p>

      @for (group of groups(); track group.name) {
        <section class="card">
          <div class="card-head">
            <h2>{{ group.name }}</h2>
            @if (!group.active) {
              <span class="pill warning">no active version</span>
            }
            <button class="small-btn" (click)="newVersion(group)"
                    [title]="'Open ' + (group.active ? 'the active' : 'the latest') + ' version in the editor as the base of a new version'">
              + New version
            </button>
          </div>
          <table>
            <thead>
              <tr><th>Version</th><th>State</th><th>Checks</th><th>Activation</th><th>User</th><th>Description</th><th></th></tr>
            </thead>
            <tbody>
              @if (group.active; as v) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: v }" />
              } @else {
                <tr><td colspan="7" class="muted">No version is active, so this {{ kind() }} cannot run. Activate one below.</td></tr>
              }
              @if (group.others.length) {
                <tr class="others-toggle">
                  <td colspan="7">
                    <button class="link" (click)="toggle(group.name)">
                      {{ isOpen(group.name) ? '▾' : '▸' }} {{ group.others.length }} other version{{ group.others.length > 1 ? 's' : '' }}
                    </button>
                  </td>
                </tr>
                @if (isOpen(group.name)) {
                  @for (v of group.others; track v.details.version) {
                    <ng-container *ngTemplateOutlet="row; context: { $implicit: v, nested: true }" />
                  }
                }
              }
            </tbody>
          </table>
        </section>
      } @empty {
        @if (!loading() && !error().length) {
          <p class="muted">No {{ kind() }} configurations found.</p>
        }
      }
    </div>

    <ng-template #row let-v let-nested="nested">
      <tr [class.dim]="v.details.deprecated" [class.nested]="nested">
        <td><strong>{{ v.details.version }}</strong></td>
        <td>
          @if (v.details.deprecated) { <span class="pill">deprecated</span> }
          @else if (v.details.active) { <span class="pill ok">active</span> }
          @else { <span class="pill">inactive</span> }
        </td>
        <td>
          @if (v.errors) { <span class="pill error">{{ v.errors }} ✖</span> }
          @if (v.warnings) { <span class="pill warning">{{ v.warnings }} ▲</span> }
          @if (!v.errors && !v.warnings) { <span class="pill ok">✓</span> }
        </td>
        <td>{{ v.details.activationDate | date: 'short' }}</td>
        <td>{{ v.details.user }}</td>
        <td class="desc">{{ v.details.description }}</td>
        <td class="row-buttons">
          <button class="ghost" (click)="open(v)">Open</button>
          @if (!v.details.deprecated) {
            @if (v.details.active) {
              <button class="ghost" (click)="change(v, 'deactivate')">Deactivate</button>
            } @else {
              <button class="ghost" (click)="change(v, 'activate')">Activate</button>
            }
            <button class="ghost danger" (click)="change(v, 'deprecate')">Deprecate</button>
          }
        </td>
      </tr>
    </ng-template>
  `,
})
export class Library {
  private readonly api = inject(ConfigApiService);
  private readonly router = inject(Router);
  private readonly catalog = inject(WorkflowCatalogService);

  protected readonly kind = signal<ConfigKind>('orchestrator');
  protected readonly items = signal<StoredConfig[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string[]>([]);
  protected readonly filter = signal('');
  /** Names whose other versions are expanded. */
  private readonly expanded = signal(new Set<string>());

  protected readonly groups = computed<Group[]>(() => {
    const term = this.filter().toLowerCase();
    const context = { workflows: this.catalog.catalog() };
    const byName = new Map<string, Group>();
    for (const item of this.items()) {
      if (term && !item.name.toLowerCase().includes(term)) {
        continue;
      }
      const issues = item.kind === 'workflow' ? validateWorkflow(item.body, context) : validateOrchestrator(item.body, context);
      const counts = countBySeverity(issues);
      const group = byName.get(item.name) ?? { name: item.name, versions: [], active: null, others: [] };
      group.versions.push({ ...item, errors: counts.error, warnings: counts.warning });
      byName.set(item.name, group);
    }
    for (const group of byName.values()) {
      group.versions.sort((a, b) => (b.details.version ?? 0) - (a.details.version ?? 0));
      group.active = group.versions.find(v => v.details.active && !v.details.deprecated) ?? null;
      group.others = group.versions.filter(v => v !== group.active);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() {
    void this.load();
  }

  protected isOpen(name: string): boolean {
    return this.expanded().has(name);
  }

  protected toggle(name: string): void {
    this.expanded.update(set => {
      const next = new Set(set);
      if (!next.delete(name)) {
        next.add(name);
      }
      return next;
    });
  }

  protected switchKind(kind: ConfigKind): void {
    this.kind.set(kind);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set([]);
    try {
      const kind = this.kind();
      const [list] = await Promise.all([firstValueFrom(this.api.list(kind)), this.catalog.refresh()]);
      this.items.set(list.map(e => toStored(kind, e)));
    } catch (e) {
      this.items.set([]);
      this.error.set(describeHttpError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected open(item: StoredConfig): void {
    queueOpen(item.kind, item.body);
    void this.router.navigate(['/', item.kind]);
  }

  /** Opens the active (or else latest) version in the editor; publishing it there creates the next version. */
  protected newVersion(group: Group): void {
    const base = group.active ?? group.versions[0];
    queueOpen(
      base.kind,
      base.body,
      `New version of ${group.name}, based on v${base.details.version}. Edit, then Publish (the next version number is suggested).`,
    );
    void this.router.navigate(['/', base.kind]);
  }

  protected async change(item: StoredConfig, action: 'activate' | 'deactivate' | 'deprecate'): Promise<void> {
    if (action === 'deprecate' && !confirm(`Deprecate ${item.name} version ${item.details.version}? This cannot be undone.`)) {
      return;
    }
    try {
      await firstValueFrom(this.api.changeState(item.kind, item.name, item.details.version!, action));
      await this.load();
    } catch (e) {
      this.error.set(describeHttpError(e));
    }
  }
}
