import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { AppLink, DeploymentConfig, otherApps, parseDeployment, serviceUrl } from './deployment';

export interface ConnectionSettings {
  /** Base URL of the workflow-manager service; empty means "same origin" (the dev proxy, or the Docker image's nginx). */
  baseUrl: string;
  /** JWT sent as `Authorization: Bearer ...` (the service is an OAuth2 resource server). */
  token: string;
}

const KEY = 'wm-ui.settings';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly saved = signal<ConnectionSettings>(load());
  readonly deployment = signal<DeploymentConfig | null>(null);
  /** The connection in use: the deployment's (same origin, no browser token) or the one saved in this browser. */
  readonly settings = computed<ConnectionSettings>(() => (this.deployment() ? { baseUrl: '', token: '' } : this.saved()));
  /** True when calls carry credentials: a token in the browser, or one added by the deployment. */
  readonly connected = computed(() => !!this.deployment() || !!this.saved().token);
  /** The portal's other apps, for the top bar. */
  readonly otherApps = computed<AppLink[]>(() => otherApps(this.deployment()?.apps ?? [], document.baseURI));

  /** Reads `config.json` (next to index.html); absent (dev server, plain static hosting) means the browser settings apply. */
  async loadDeployment(): Promise<void> {
    try {
      const res = await fetch('config.json', { cache: 'no-store' });
      if (!res.ok) return;
      this.deployment.set(parseDeployment(await res.json()));
    } catch {
      // no deployment config: keep the browser settings
    }
  }

  save(settings: ConnectionSettings): void {
    const clean = { baseUrl: settings.baseUrl.trim().replace(/\/+$/, ''), token: settings.token.trim().replace(/^Bearer\s+/i, '') };
    this.saved.set(clean);
    try {
      localStorage.setItem(KEY, JSON.stringify(clean));
    } catch {
      // storage unavailable (private mode): settings stay in memory for this session
    }
  }

  url(path: string): string {
    return serviceUrl(this.settings().baseUrl, path);
  }
}

function load(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = { baseUrl: '', token: '', ...JSON.parse(raw) };
      return { ...saved, token: saved.token || environment.devToken };
    }
  } catch {
    // ignore unreadable storage
  }
  // Development builds prefill a token for the local service (see environment.development.ts).
  return { baseUrl: '', token: environment.devToken };
}
