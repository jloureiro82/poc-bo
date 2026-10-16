import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SettingsService } from './core/settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- the overview page brings its own floating nav -->
    @if (!onOverview()) {
    <nav class="topnav">
      <a class="brand" routerLink="/overview" title="Overview"><img class="brand-mark" src="favicon.svg" alt="" width="20" height="20" />Flow Configurator</a>
      <a routerLink="/orchestrator" routerLinkActive="active">Orchestrators</a>
      <a routerLink="/workflow" routerLinkActive="active">Workflows</a>
      <a routerLink="/library" routerLinkActive="active">Stored configurations</a>
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
    }
    <router-outlet />
  `,
})
export class App {
  protected readonly settings = inject(SettingsService);
  private readonly router = inject(Router);
  protected readonly onOverview = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/overview')),
    ),
    { initialValue: false },
  );
}
