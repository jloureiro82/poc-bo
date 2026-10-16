import { Component, computed, input, output } from '@angular/core';
import { Issue, countBySeverity, sortIssues } from '../core/issues';

@Component({
  selector: 'app-issues-panel',
  template: `
    <div class="issues-head">
      <strong>Validation</strong>
      @if (counts().error === 0 && counts().warning === 0) {
        <span class="pill ok">✓ No problems found</span>
      }
      @if (counts().error) {
        <span class="pill error">{{ counts().error }} error{{ counts().error > 1 ? 's' : '' }}</span>
      }
      @if (counts().warning) {
        <span class="pill warning">{{ counts().warning }} warning{{ counts().warning > 1 ? 's' : '' }}</span>
      }
      @if (counts().info) {
        <span class="pill info">{{ counts().info }} note{{ counts().info > 1 ? 's' : '' }}</span>
      }
      @if (note()) {
        <span class="muted small">{{ note() }}</span>
      }
    </div>
    <ul class="issues">
      @for (issue of sorted(); track $index) {
        <li [class]="issue.severity">
          <button type="button" (click)="select.emit(issue.node)" [title]="'Go to ' + (issue.path || 'root')">
            <span class="sev" aria-hidden="true">{{ icon[issue.severity] }}</span>
            <span class="visually-hidden">{{ issue.severity }}:</span>
            <code class="where">{{ issue.path || '(root)' }}</code>
            <span>{{ issue.message }}</span>
          </button>
        </li>
      }
    </ul>
  `,
})
export class IssuesPanel {
  readonly issues = input.required<Issue[]>();
  /** Extra context, e.g. "workflow references not checked (not connected)". */
  readonly note = input<string | null>(null);
  readonly select = output<string>();

  protected readonly sorted = computed(() => sortIssues(this.issues()));
  protected readonly counts = computed(() => countBySeverity(this.issues()));
  protected readonly icon = { error: '✖', warning: '▲', info: 'i' };
}
