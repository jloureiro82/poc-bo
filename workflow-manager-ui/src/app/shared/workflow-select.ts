import { Component, computed, inject, input, output } from '@angular/core';
import { WorkflowCatalogService } from '../core/workflow-catalog.service';

/**
 * Picks a workflow by name, or none. Lists the workflows the service runs, keeps an unknown current value selectable
 * so nothing is silently lost, and falls back to free text while the catalog is unavailable.
 */
@Component({
  selector: 'app-workflow-select',
  template: `
    @if (catalog.workflows(); as workflows) {
      <div class="select-row">
        <select [class.invalid]="missing()" (change)="valueChange.emit($any($event.target).value)">
          <option value="" [selected]="!value()">(none)</option>
          @if (missing()) {
            <option [value]="value()" selected>{{ value() }}</option>
          }
          @for (w of sorted(); track w.name) {
            <option [value]="w.name" [selected]="w.name === value()">{{ w.name }}</option>
          }
        </select>
        <button class="icon" type="button" title="Reload the workflow list" aria-label="Reload the workflow list" [disabled]="catalog.loading()" (click)="catalog.refresh()">↻</button>
      </div>
      @if (missing()) {
        <small class="error-text">The service runs no workflow with this name.</small>
      }
      @if (!workflows.length) {
        <small class="muted">The service runs no workflows yet. Publish one first.</small>
      }
    } @else {
      <input [value]="value()" (input)="valueChange.emit($any($event.target).value)" placeholder="workflow name" />
      <small class="muted">
        {{ catalog.loading() ? 'Loading workflows…' : 'Not connected: type the name. Connect in Settings to pick from a list.' }}
      </small>
    }
  `,
})
export class WorkflowSelect {
  protected readonly catalog = inject(WorkflowCatalogService);

  readonly value = input<string>('');
  readonly valueChange = output<string>();

  protected readonly sorted = computed(() => [...(this.catalog.workflows() ?? [])].sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly missing = computed(() => !!this.value() && !this.value().includes('${') && !this.sorted().some(w => w.name === this.value()));
}
