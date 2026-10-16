import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SettingsService } from './core/settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="topnav">
      <a class="brand" routerLink="/workflow" title="Workflow editor"><span class="brand-mark" aria-hidden="true"></span>Workflow Configurator</a>
      <a routerLink="/workflow" routerLinkActive="active">Workflow</a>
      <a routerLink="/library" routerLinkActive="active">Stored workflows</a>
      <a routerLink="/executions" routerLinkActive="active">Executions</a>
      <span class="spacer"></span>
      @if (settings.otherApps().length) {
        <span class="app-links" role="group" aria-label="Other apps">
          @for (app of settings.otherApps(); track app.url) {
            <a class="app-link" [href]="app.url" [title]="'Open the ' + app.name">{{ app.name }}</a>
          }
        </span>
      }
      <a routerLink="/settings" routerLinkActive="active" class="conn" [class.warn]="!settings.connected()"
         [title]="settings.deployment() ? 'The connection is set by the deployment. Open the connection details.' : settings.connected() ? 'A token is set. Open the connection settings.' : 'No token is set, so calls to the service will fail. Open the connection settings.'">
        {{ settings.connected() ? 'Connection' : 'Set a token' }}
      </a>
    </nav>
    <router-outlet />
  `,
})
export class App {
  protected readonly settings = inject(SettingsService);
}
