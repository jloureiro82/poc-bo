import { Component, computed, inject, input, output } from '@angular/core';
import { WorkflowCatalogService } from '../core/workflow-catalog.service';

/**
 * Picks a stored workflow by label. Lists what the service has (with its active version), keeps an unknown current
 * value selectable so nothing is silently lost, and falls back to free text while the catalog is unavailable.
 */
@Component({
  selector: 'app-workflow-select',
  template: `
    @if (catalog.workflows(); as workflows) {
      <div class="select-row">
        <select [class.invalid]="missing()" (change)="valueChange.emit($any($event.target).value)">
          <option value="" [selected]="!value()">(choose a workflow)</option>
          @if (missing()) {
            <option [value]="value()" selected>{{ value() }}</option>
          }
          @for (w of sorted(); track w.label) {
            <option [value]="w.label" [selected]="w.label === value()">{{ w.label }}</option>
          }
        </select>
        <button class="icon" type="button" title="Reload the workflow list" aria-label="Reload the workflow list" [disabled]="catalog.loading()" (click)="catalog.refresh()">↻</button>
      </div>
      @if (selected(); as w) {
        @if (w.activeVersion == null) {
          <small class="error-text">This workflow has no active version, so running it will fail.</small>
        }
      }
      @if (!workflows.length) {
        <small class="muted">No workflows are stored yet. Create one in the Workflows editor.</small>
      }
    } @else {
      <input [value]="value()" (input)="valueChange.emit($any($event.target).value)" placeholder="workflow label" />
      <small class="muted">
        {{ catalog.loading() ? 'Loading workflows…' : 'Not connected: type the label. Connect in Settings to pick from a list.' }}
      </small>
    }
  `,
})
export class WorkflowSelect {
  protected readonly catalog = inject(WorkflowCatalogService);

  readonly value = input<string>('');
  readonly valueChange = output<string>();

  protected readonly sorted = computed(() =>
    [...(this.catalog.workflows() ?? [])].sort((a, b) => a.label.localeCompare(b.label)),
  );
  protected readonly selected = computed(() => this.sorted().find(w => w.label === this.value()) ?? null);
  protected readonly missing = computed(() => !!this.value() && !this.selected());
}
