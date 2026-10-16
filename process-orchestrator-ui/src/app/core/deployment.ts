// The Docker deployment's settings: `config.json`, written by the image at startup (docker/15-app-config.sh).
// Shared with process-orchestrator-ui: keep the two copies identical.

/** Another app of the same deployment (the configurator portal), linked from the top bar. */
export interface AppLink {
  name: string;
  /** Where the app is served, usually a path on the portal, e.g. `/flows/`. */
  url: string;
}

/**
 * When present, the deployment owns the connection: the app calls its own origin and nginx adds the token, so the
 * browser never holds it.
 */
export interface DeploymentConfig {
  managed: true;
  /** The service nginx proxies to, shown on the Connection page. */
  backend: string;
  /** The portal's apps, this one included. Empty when the app is deployed on its own. */
  apps: AppLink[];
}

/** Reads `config.json`; anything other than a managed deployment means the browser settings apply. */
export function parseDeployment(value: unknown): DeploymentConfig | null {
  if (!isObject(value) || value['managed'] !== true) return null;
  const apps = Array.isArray(value['apps']) ? value['apps'] : [];
  return {
    managed: true,
    backend: String(value['backend'] ?? ''),
    apps: apps
      .filter(a => isObject(a) && typeof a['name'] === 'string' && typeof a['url'] === 'string' && a['name'] && a['url'])
      .map(a => ({ name: String(a['name']), url: String(a['url']) })),
  };
}

/** The apps other than the one served at `baseUri` (the page's `document.baseURI`). */
export function otherApps(apps: AppLink[], baseUri: string): AppLink[] {
  const here = folder(baseUri);
  return apps.filter(app => folder(new URL(app.url, baseUri).href) !== here);
}

/**
 * The URL of a service path. Without a base URL it is relative (`api/v1/…`), so it resolves against `<base href>`:
 * `/api/v1/…` on the dev server, `/workflows/api/v1/…` when the portal serves the app under `/workflows/`.
 */
export function serviceUrl(baseUrl: string, path: string): string {
  return baseUrl ? `${baseUrl}${path}` : path.replace(/^\/+/, '');
}

function folder(url: string): string {
  const { origin, pathname } = new URL(url);
  return origin + pathname.replace(/\/*$/, '/');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
