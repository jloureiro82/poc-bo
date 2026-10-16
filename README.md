# Config UI

The configurator portal and its micro frontends, in one repository:

| Folder | Image | Served at | What it is | Service |
|---|---|---|---|---|
| [`configurator-portal`](configurator-portal) | `configurator-portal` | `/` | Landing page and path routing (nginx, no app code) | |
| [`workflow-manager-ui`](workflow-manager-ui) | `workflow-manager-ui` | `/workflows/` | Workflow Configurator (Angular) | workflow-manager |
| [`process-orchestrator-ui`](process-orchestrator-ui) | `process-orchestrator-ui` | `/flows/` | Flow Configurator (Angular) | process-orchestrator |

Each app is a **vertical micro frontend**: its own folder, its own image, its own release. It is built, tested and
deployed on its own, and runs on its own too (without the portal it is served from `/`). The portal forwards each path
to the app's container and strips the prefix. Each app's top bar links to the others, and moving between apps loads a
new page.

```
browser ── portal :8080 ──┬── /workflows/ ──> workflow-manager-ui (nginx) ── /api ──> workflow-manager  (+ WM_TOKEN)
                          └── /flows/     ──> process-orchestrator-ui (nginx) ── /api ──> process-orchestrator (+ PO_TOKEN)
```

The backends (`workflow-manager`, `process-orchestrator`) are not part of this repository.

## Build and run with Docker

```bash
cp .env.example .env        # then fill in WM_TOKEN and PO_TOKEN (and the service URLs if they are not on the host)
docker compose build        # builds the three images
docker compose up -d --wait # starts them; open http://localhost:8080
```

The Angular apps are built inside their images (`node:24-alpine`, then `nginx:1.29-alpine`), so the host needs only
Docker.

| Variable (`.env`) | Default | Meaning |
|---|---|---|
| `PORTAL_PORT` | `8080` | Host port of the portal |
| `IMAGE_PREFIX` | (empty) | Registry prefix for the image names, with its trailing `/` |
| `IMAGE_TAG` | `latest` | Tag of the three images |
| `WM_BACKEND_URL` | `http://host.docker.internal:8081/workflowmanager` | workflow-manager, with its context path |
| `WM_TOKEN` | (required) | JWT for workflow-manager, without `Bearer ` |
| `PO_BACKEND_URL` | `http://host.docker.internal:8081/process-orchestrator` | process-orchestrator, with its context path |
| `PO_TOKEN` | (required) | JWT for process-orchestrator, without `Bearer ` |

The defaults point at services running on the host. Both services use port 8081 in their dev profile, so move one of
them when you run both locally.

### Push to a registry

```bash
# in .env: IMAGE_PREFIX=registry.example.com/configurators/  IMAGE_TAG=1.0.0
docker compose build
docker compose push
```

Each image can also be built on its own: `docker build -t workflow-manager-ui ./workflow-manager-ui` (and the same for
the other two folders).

### CI

Each component has its own Jenkins pipeline in `<component>/ci/Jenkinsfile`: tests (apps only), image build
and push, and the DEV deploy on `develop`. Set each one up as its own pipeline job (plain or multibranch) on this repository, with that
file as the Script Path. `deploy/ci/Jenkinsfile` deploys to DEV (see `deploy/`). Each image has its own version: `version` in the app's `package.json`, or
`configurator-portal/VERSION`.

### Security

Tokens stay on the server: each app's nginx adds its own token to the calls it forwards, and the browser never sees
one. **Anyone who can open the portal can use both services with those tokens' roles.** If the portal is reachable
beyond a trusted network, put authentication in front of it (an ingress or an auth proxy). `.env` and the apps'
`src/environments/environment.development.ts` (dev tokens) are git-ignored and never copied into an image.

## Deploy elsewhere (Kubernetes, ECS, …)

Run the three images as three services. Only the portal needs to be reachable from outside.

| Image | Settings |
|---|---|
| `workflow-manager-ui` | `WM_BACKEND_URL`, `WM_TOKEN`, `APP_BASE_PATH=/workflows/`, `APP_LINKS` |
| `process-orchestrator-ui` | `PO_BACKEND_URL`, `PO_TOKEN`, `APP_BASE_PATH=/flows/`, `APP_LINKS` |
| `configurator-portal` | `PORTAL_WM_UI_URL` (default `http://workflow-manager-ui`), `PORTAL_PO_UI_URL` (default `http://process-orchestrator-ui`) |

- `APP_BASE_PATH` is the path the portal serves the app under. The app's container still serves from `/` (the portal
  strips the prefix), but the page's `<base href>` changes, and with it every bundle and API URL.
- `APP_LINKS` lists the apps for the top bar, `Name=url` separated by `;`. The compose file uses
  `Workflow Configurator=/workflows/;Flow Configurator=/flows/`. Each app leaves itself out.
- An app's container stops at startup, with a message, if a setting is missing or malformed.
- Every image answers `GET /healthz`, which its Docker `HEALTHCHECK` also uses. The landing page also checks
  `/workflows/management/health` and `/flows/management/health`, which go through the app to its service.
- The portal resolves the apps' host names when it starts, so start it after them. Compose waits for them to be
  healthy.

To add another app, give it the same container contract (`APP_BASE_PATH`, `APP_LINKS`, its own `/api` proxy). Then
add a `location` to `configurator-portal/nginx.conf.template`, a card to `configurator-portal/html/index.html`, an
entry to `APP_LINKS`, and a service to `docker-compose.yml`.

## Develop

Each app is a standalone Angular project. See its README for the dev server, tests and the dev token:

```bash
cd process-orchestrator-ui   # or workflow-manager-ui
npm ci
npm start                    # dev server with a proxy to the local service
npm test
```

`npm start` reads the service token from `src/environments/environment.development.ts`, which is git-ignored. Create it
as the app's README describes.

## Files

| File | What it is |
|---|---|
| `docker-compose.yml` | The portal and both apps, built from their folders |
| `deploy/` | Deployment from the pushed images: `docker-compose.yml`, `.env` (versions, ports, logging), and `env/<name>.env` per container (for now including the apps' tokens) |
| `.env.example` | The deploy-time settings; copy to `.env` (git-ignored) |
| `.gitattributes` | Keeps LF line endings on files used inside the containers |
