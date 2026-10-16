import { Component, inject, signal } from '@angular/core';
import { AutoGrow } from '../../shared/auto-grow';
import { SettingsService } from '../../core/settings.service';
import { WorkflowCatalogService } from '../../core/workflow-catalog.service';

@Component({
  selector: 'app-settings',
  imports: [AutoGrow],
  template: `
    <div class="page narrow">
      <h1>Connection</h1>
      <p class="muted">
        The configurator talks to the workflow-manager REST API (<code>/api/v1/configuration</code>,
        <code>/api/v1/deployment</code>, <code>/api/v1/execution</code>). Editing and validation work offline; the
        connection is needed to check workflow references, browse stored workflows and executions, and publish.
      </p>
      @if (settings.deployment(); as deployment) {
        <p>
          This deployment sets the connection. Requests go through the server to
          <code>{{ deployment.backend || 'the configured service' }}</code>, and the server adds the token, so it is
          never stored in this browser. To change them, redeploy with new <code>WM_BACKEND_URL</code> and
          <code>WM_TOKEN</code> values.
        </p>
        <div class="actions left">
          <button class="primary" (click)="test()">Test connection</button>
          @if (status()) {
            <span [class]="status()!.ok ? 'pill ok' : 'pill error'">{{ status()!.text }}</span>
          }
        </div>
      } @else {
      <label class="field">
        <span>Service base URL</span>
        <input [value]="baseUrl()" (input)="baseUrl.set($any($event.target).value)" placeholder="(empty = through the dev proxy)" />
        <small class="muted">
          Leave empty when running <code>npm start</code>: the dev server proxies <code>/api</code> to
          <code>http://localhost:8081/workflowmanager</code> (see <code>proxy.conf.json</code>). A direct URL includes
          the context path, e.g. <code>http://host:8081/workflowmanager</code>, and needs CORS enabled on the service
          (<code>jhipster.cors</code>).
        </small>
      </label>
      <label class="field">
        <span>JWT</span>
        <textarea autoGrow singleLine rows="3" spellcheck="false" [value]="token()" (input)="token.set($any($event.target).value)"
                  placeholder="eyJhbGciOi…"></textarea>
        <small class="muted">Sent as <code>Authorization: Bearer …</code>. Stored in this browser only.</small>
      </label>
      <div class="actions left">
        <button class="primary" (click)="save()">Save and test</button>
        @if (status()) {
          <span [class]="status()!.ok ? 'pill ok' : 'pill error'">{{ status()!.text }}</span>
        }
      </div>
      }
    </div>
  `,
})
export class Settings {
  protected readonly settings = inject(SettingsService);
  private readonly catalog = inject(WorkflowCatalogService);

  protected readonly baseUrl = signal(this.settings.settings().baseUrl);
  protected readonly token = signal(this.settings.settings().token);
  protected readonly status = signal<{ ok: boolean; text: string } | null>(null);

  protected async save(): Promise<void> {
    this.settings.save({ baseUrl: this.baseUrl(), token: this.token() });
    await this.test();
  }

  protected async test(): Promise<void> {
    this.status.set({ ok: true, text: 'Testing…' });
    await this.catalog.refresh();
    const error = this.catalog.error();
    this.status.set(
      error ? { ok: false, text: error } : { ok: true, text: `Connected · ${this.catalog.workflows()?.length ?? 0} running workflows found` },
    );
  }
}
