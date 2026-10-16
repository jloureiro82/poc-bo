# Workflow Configurator

A web app for designing, validating, publishing and monitoring the workflows of the
[workflow-manager](../workflow-manager) service.

A **workflow** is a sequence of **tasks**: HTTP calls, logical checks, notifications, decisions and loops. The
service stores each workflow as versioned JSON. Without this app you edit that JSON by hand and only find mistakes
when a run fails. The Workflow Configurator shows the workflow as a diagram you can edit, and checks it against the
rules the engine actually applies.

It is the workflow-manager edition of the [Flow Configurator](../process-orchestrator-ui), which does the same job
for the process-orchestrator service. The two share their design and most of their editor. This one has no
orchestrator editor, because workflow-manager has no orchestrators.

## What you can do

| Page | Use it to |
|---|---|
| **Workflow** | Draw and edit a workflow: tasks top to bottom, decision cases side by side, loops as boxes. |
| **Stored workflows** | Browse the version the service runs for each workflow, start a new version, deprecate one. |
| **Executions** | Browse the run history, and see how each run went: the workflow coloured by task outcome, a timeline, errors with stack traces, and each task's result. |
| **Settings** | Point the app at a service and set the JWT. |

Highlights:

- **Edit on the diagram**: add tasks from templates, drag tasks between cases and loops, remove them. The outline,
  form inspector and raw JSON stay in sync.
- **Instant validation** with the engine's real rules: the fields the service stores, task types it can dispatch,
  HTTP / notification / map-resolver fields, retry values, and **SpEL syntax** in every `${…}`.
- **Reference checks** against the service: a failure or rejection workflow must be one the service runs.
- **Task templates** that are valid as soon as they are created.
- **Execution history** drawn on the exact definition each run used.

The [User guide](docs/user-guide.md) walks through every screen. The [Validation rules](docs/validation-rules.md)
reference lists every check, and the backend code each one comes from.

## Quick start

Prerequisites: Node.js 22+ (24 is used here), npm, and a running workflow-manager service.

```bash
npm install
npm start                  # http://localhost:4301
```

`npm start` runs the Angular dev server. It proxies `/api` and `/management` to
`http://localhost:8081/workflowmanager/...` (see `proxy.conf.json`), so the browser never needs CORS.

Then open **Settings**, paste a JWT, and click **Save and test**. You can edit and validate without a connection.
Reference checks, stored workflows, executions and publishing need one.

> In development builds, a token signed with the service's development secret is filled in for you. It is read
> from `src/environments/environment.development.ts`. That file is git-ignored, so create it from
> `environment.ts` if it is missing. Production builds never contain a token.

### Running the service locally

```bash
cd ../workflow-manager
./mvnw -o                  # JDK 17 to 21; http://localhost:8081/workflowmanager
```

- The dev profile uses port **8081**, the same as process-orchestrator. Run one of them at a time, or move one with
  `-Dspring-boot.run.arguments=--server.port=8082` and change `proxy.conf.json` to match.
- The dev profile turns the JMS messenger on, which needs a broker. Without one, add
  `--workflowengine.messenger.provider.jms.active=false` to the arguments and use `sync` workflows.
- Health: `http://localhost:8081/workflowmanager/management/health`.

## Docker

The image builds the production bundle and serves it with nginx. nginx proxies `/api` and `/management` to the
service and adds the token to every call, so the service URL and token are set when you deploy, not in the browser.
The token never reaches the browser, and the **Connection** page only shows where requests go.

| Variable | Required | Meaning |
|---|---|---|
| `WM_BACKEND_URL` | yes | The service, with its context path, e.g. `http://workflow-manager:8081/workflowmanager` |
| `WM_TOKEN` | yes | The JWT, without `Bearer `. nginx sends it as `Authorization: Bearer <token>` |
| `APP_BASE_PATH` | no | The path a portal serves the app under, e.g. `/workflows/` (default `/`) |
| `APP_LINKS` | no | The portal's apps for the top bar: `Name=url` separated by `;` |

The container stops at startup, with a message, if either one is missing.

```bash
docker build -t workflow-manager-ui .
docker run -d -p 8080:80 \
  -e WM_BACKEND_URL=http://workflow-manager:8081/workflowmanager \
  -e WM_TOKEN=eyJhbGciOi... \
  workflow-manager-ui                     # http://localhost:8080
```

Or with Compose: put `WM_TOKEN=...` (and optionally `WM_BACKEND_URL=...`) in a `.env` file, which is git-ignored,
then run `docker compose up -d --build`. By default, Compose points at a service on the host
(`host.docker.internal:8081`). Anyone who can open the app can use the service with that token's roles, so put
access control in front of it if it is reachable beyond a trusted network. `GET /healthz` is the container's
health check.

Without the Docker config (`npm start`, or the bundle on any other static host), the app works as before: you set
the URL and token on the Connection page.

### Together with the Flow Configurator

This app is a micro frontend of the [configurator portal](../configurator-portal). The portal serves it under
`/workflows/` and the Flow Configurator under `/flows/`, with links between the two in the top bar. Each app keeps
its own image, service and token. `docker compose up -d --build --wait` at the repository root builds and starts
all three images. See the [root README](../README.md) for deploying them elsewhere.

## What the service lets a client do

workflow-manager's API is narrower than process-orchestrator's, and the app follows it:

- **One version per workflow is visible**: the one the service runs (the highest active, non-deprecated version whose
  activation date has passed). Older and inactive versions cannot be listed.
- **A version cannot be activated or deactivated later.** It can only be deprecated, which is final.
- **The service stores a fixed set of workflow fields.** Anything else at the top level of a definition is dropped
  on publish. The editor warns about each such field.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Dev server on port 4301, with the proxy |
| `npm test` | Unit tests (Vitest) |
| `npx ng build --configuration development` | Fast type check and build |
| `npm run build` | Production build into `dist/` |

## Documentation

- [docs/user-guide.md](docs/user-guide.md): every screen, step by step
- [docs/validation-rules.md](docs/validation-rules.md): every rule and its backend source
- [docs/architecture.md](docs/architecture.md): code layout and how to extend it
- [CLAUDE.md](CLAUDE.md): working notes for AI-assisted development
