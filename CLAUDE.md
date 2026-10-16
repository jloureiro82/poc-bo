# CLAUDE.md

Working notes for AI-assisted development of **config-ui**: the configurator portal and its two micro frontends, in
one repository. Each app also has its own `CLAUDE.md` with its commands, domain rules and conventions. Read that one
before changing the app.

| Folder | What it is | Served at | Image |
|---|---|---|---|
| `configurator-portal/` | nginx with a landing page (`html/index.html`) and path routing. No app code, no build step | `/` | `configurator-portal` |
| `workflow-manager-ui/` | **Workflow Configurator**, Angular, for the workflow-manager service | `/workflows/` | `workflow-manager-ui` |
| `process-orchestrator-ui/` | **Flow Configurator**, Angular, for the process-orchestrator service | `/flows/` | `process-orchestrator-ui` |

[README.md](README.md) covers building, running and deploying. The apps' `docs/` hold their architecture, validation
rules and user guides.

## Repository rules

- **Each app is standalone.** It has its own `package.json`, lock file, `node_modules`, Angular version, Dockerfile
  and release. There are no npm workspaces and no shared library. Run npm commands from inside the app's folder,
  never from the root. Each component also has its own Jenkins pipeline (`<component>/ci/Jenkinsfile`) and version.
- **The two apps are near-copies.** workflow-manager-ui was copied from process-orchestrator-ui and still shares the
  editor, diagrams, SpEL checker, styles, the editor and execution features, and the container setup
  (`docker/15-app-config.sh`, `docker/nginx.conf.template`, `src/app/core/deployment.ts`). **When a fix applies to
  both, make it in both, in the same change**, and run both test suites. The differences are listed in each app's
  `CLAUDE.md`: env prefix `WM_` vs `PO_`, context path `/workflowmanager` vs `/process-orchestrator`, dev port and
  `localStorage` prefix, and orchestrators (process-orchestrator only).
- **The backends are not in this repo.** The app `CLAUDE.md` files write them as `<workflow-manager>` and
  `<process-orchestrator>`. On the original developer machine they are `C:\DEV\projects\components\workflow-manager`
  and `C:\DEV\projects\components\process-orchestrator`. Ask for the path if those are missing. Read a backend when a
  rule is unclear. Do not change it from here.
- The apps are linked by name and path in three places that must agree: `APP_LINKS` and the services in
  `docker-compose.yml`, the `location` blocks in `configurator-portal/nginx.conf.template`, and the cards in
  `configurator-portal/html/index.html`. To add an app, update all three, then give it a
  `ci/Jenkinsfile` (copy an app's and change `component`), a `sonar-project.properties` and its own Jenkins job.

## Commands

```bash
# one app (from its folder): see its CLAUDE.md for the dev server port and the backend
cd process-orchestrator-ui && npm ci && npm test        # same for workflow-manager-ui
npx ng build --configuration development                # fast typecheck

# whole stack (from the root): builds the three images and serves the portal on PORTAL_PORT (8080)
cp .env.example .env                                    # fill WM_TOKEN and PO_TOKEN
docker compose up -d --build --wait
docker compose down
```

- Check the stack without touching a real `.env`: write an env file in the scratchpad with placeholder tokens
  (`WM_TOKEN=aaa.bbb.ccc`), a free port and `IMAGE_TAG=check`, then
  `docker compose --env-file <file> -p cfgcheck up -d --build --wait`. Probe `/`, `/healthz`, `/flows/`,
  `/workflows/` and `/<app>/config.json` (`<base href>` must be the app's path). Then run `down` and remove the
  `:check` images. API calls need real backends and tokens.
- In Git Bash, set `MSYS_NO_PATHCONV=1` before `docker run -e APP_BASE_PATH=/x/` or `-v` with Linux paths, or Git
  Bash rewrites the path into a Windows one.
- To run an app's tests in Linux (as CI does) without putting Linux `node_modules` into the repo, copy the app folder to
  the scratchpad and mount that copy into `node:24-alpine`. On Windows the bind mount makes `npm ci` slow, so allow
  several minutes per app.

## CI (`<component>/ci/Jenkinsfile`)

Each component has its own pipeline, set up in Jenkins as its own pipeline job (plain or multibranch) on this repository with Script Path
`<component>/ci/Jenkinsfile`. It runs from the workspace root and works on the folder named by `component`, which is
also the image name and the Sonar project key prefix (`<component>-<branch>`).

Stages: version (`-snapshot` on `develop`), unit tests in `node:24-alpine` (apps only; the portal has no code), Sonar
(`sonarsource/sonar-scanner-cli` on the component folder, settings in `<component>/sonar-project.properties`),
`docker build` of the folder, push to `${dockerRegistry}/${dockerRepo}/${project}/<component>:<version>`, and on
`develop` the DEV deploy job (skipped while `deployDevJob` is empty).

- The two app pipelines differ only in `component` and comments. When you change one, change the other too. Make the
  same change in the portal's pipeline when it touches a stage the portal also has.

- The agent is expected to have only Docker. Every tool runs in a container started with
  `--user $(id -u):$(id -g)`, so `deleteDir()` can remove what it leaves behind.
- Sonar's URL and token come from `withSonarQubeEnv(installationName: 'SonarQube', credentialsId: 'SonarQubeToken')`,
  as in the other components' pipelines on this Jenkins. Never write tokens into a Jenkinsfile.
- The agents cannot reach Docker Hub. Every image comes through the mirror `dockerMirror` (`nexus:8440`): the tool
  images by name (`nexus:8440/node:24-alpine`), and the Dockerfiles' bases through the `BASE_REGISTRY` build arg,
  which is empty (Docker Hub) for local builds. A new `FROM` must use `${BASE_REGISTRY}` too.
- Sonar (`ci.dev.multicert.com`) is reached directly, from a scanner container on the agent's network
  (`--network host`). Tried on 2026-10-16: this passes on worker02 and times out on worker01 (left to infra); a
  container's own network and the proxy `proxy.multicert.inet` both time out on worker02.
- Proxy settings reach the image builds as `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` build args, which npm reads. The
  Dockerfiles need no proxy-specific code.
- To release a component, bump its own version: `version` in the app's `package.json` (and the two matching fields at
  the top of `package-lock.json`), or `configurator-portal/VERSION`.

## Secrets and files that must stay out

- `.env` holds deploy tokens, and `*/src/environments/environment.development.ts` holds each app's dev JWT for
  `npm start`. Both are git-ignored and in each app's `.dockerignore`. Never commit or print them. Redact `eyJ…` in
  any output you show.
- Tokens are added by each app's nginx on the server side. Never move a token into the browser bundle, `config.json`,
  or a build arg.

## Gotchas

- **Line endings.** This clone has `core.autocrlf=true`. `.gitattributes` forces LF on `*.sh`, `*.template`,
  `Dockerfile` and `*.yml`. A CRLF in `docker/15-app-config.sh` makes the app container exit at startup. Keep new
  container files covered by `.gitattributes`.
- **Relative URLs only.** The portal strips `/flows/` and `/workflows/` before forwarding, and the app's startup
  script rewrites `<base href>`. App code builds service URLs with `settings.url('/api/…')`. Never hard-code `/api` or
  fetch from `/` (details in each app's `CLAUDE.md`).
- The portal resolves the apps' host names at startup, so it must start after them. Compose waits for both apps to
  be healthy.
- Both backends use port 8081 in their dev profiles, so only one runs on the default port at a time.
