# CLAUDE.md

Working notes for AI-assisted development of the **Workflow Configurator** (`workflow-manager-ui`), an Angular app
that edits, validates, publishes and monitors the workflows of the service `<workflow-manager>` (a separate checkout; see the root [CLAUDE.md](../CLAUDE.md)).
Read [docs/architecture.md](docs/architecture.md) for the code layout and
[docs/validation-rules.md](docs/validation-rules.md) for every rule and its backend source.

It was created as a copy of `../process-orchestrator-ui` (the Flow Configurator for process-orchestrator) and
adapted. The two share the editor, the diagram, the SpEL checker, all styles, and the editor and execution features
(undo/redo, drafts, find, shortcuts, copy/paste of tasks, publish change list, run dialogs, run comparison and health,
picture export). When a fix applies to both, make it in both. workflow-manager has no orchestrators, so this app has no
orchestrator editor. In process-orchestrator, flows are started from the orchestrator editor, not from a workflow.

## Commands

```bash
npm start                                   # dev server :4301, proxy /api,/management -> :8081/workflowmanager
npm test                                    # vitest (ng test --watch=false), ~10 s
npx ng build --configuration development    # fast typecheck/build
npm run build                               # production build
```

- The dev server **live-reloads** on source and style changes. Restart it only after changing `angular.json`,
  `proxy.conf.json` or `src/environments/*`.
- Run the dev server and the backend with `run_in_background` and `timeout: 7200000`. When the background limit
  ends the wrapper task, the server process usually keeps running, so check the port before restarting. Restarting
  a second copy on a busy port fails.
- To stop by port (PowerShell): `Get-NetTCPConnection -LocalPort 4301 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`.

## Backend (needed for references, library, executions, publish)

- Start it with `cd <workflow-manager> && ./mvnw -o` (JDK 17 to 21; the default JDK 17 works). Startup takes about
  40 s; health is at `http://localhost:8081/workflowmanager/management/health`.
- **Context path `/workflowmanager`**. `proxy.conf.json` rewrites `/api` to `/workflowmanager/api`.
- **Port 8081 is shared** with process-orchestrator. An empty `404` on `/management/health` means the other app holds
  the port.
- **A throwaway instance** leaves the port and the developer's dev database (`<workflow-manager>/target/h2db`, real
  local data) alone. Use it for checks that publish or run workflows:

  ```bash
  cd <workflow-manager> && ./mvnw -o -Dspring-boot.run.arguments="--server.port=8083 --workflowengine.messenger.provider.jms.active=false --spring.datasource.url=jdbc:h2:mem:wmui;DB_CLOSE_DELAY=-1"
  ```

  Then serve the app against it with a copy of `proxy.conf.json` that targets 8083 (8082 may be taken by a local tunnel):
  `npx ng serve --proxy-config <copy>.json`. The in-memory database starts with Liquibase's fake rows: executions
  with random text in every column. Real ones appear after you publish and run a workflow.
- **Auth**: the service has no login endpoint. The dev token lives in `src/environments/environment.development.ts`
  (git-ignored). It is signed HS512 with the service's dev secret (`jhipster.security.authentication.jwt.base64-secret`
  in `application-dev.yml`, base64-decoded), with `auth: "ROLE_ADMIN ROLE_USER"`. Use it for `curl`:
  `T=$(grep -o "devToken: '[^']*" src/environments/environment.development.ts | cut -c12-)`.
- Endpoints the app uses:
  - `POST /api/v1/configuration/business-logic/entity-type/workflow`: create a version
    (`{ configurationDetails, workflowConfiguration }`). A taken version answers `500` with
    `detail: "the version [n] already exists"`.
  - `GET /api/v1/deployment/entity-type/WORKFLOW`: the **running** version of every workflow. The definition is JSON
    text in `payload`.
  - `GET /api/v1/deployment/entity-type/WORKFLOW/entity-name/{name}`: one running version, or `500 "Entity Not Found"`.
  - `POST /api/v1/deployment/deprecate/entity-type/WORKFLOW/entity-name/{name}/version/{v}`: deprecate (final).
  - Executions come from `/api/v1/execution` (the user asked for the `/v1` resources):
    - `GET /api/v1/execution/workflow/workflowid/{id}`: one run, parsed (`name`, `error`, `execution`,
      `workflowDefinition`). An unknown id answers `200` with an empty body.
    - `GET /api/v1/execution/tasks?workflowId.equals=…`: task executions, with criteria filters and `X-Total-Count`.
      They carry no output; a task's details are in the run's `execution` map (`findTaskTrace`).
    - `GET /api/v1/execution/workflow`: the list, with criteria filters and `X-Total-Count`. Builds from before
      2026-10-13 **answer `500 "[/workflow] is not a valid HTTP URL"`** (`UriComponentsBuilder.fromHttpUrl("/workflow")`
      in `v1.WorkflowExecutionResource.getAllWorkflow`, fixed in the source to `ServletUriComponentsBuilder.fromCurrentRequest()`).
      The user chose `/v1` only: there is no fallback to `/api/workflows`, and `describeHttpError` explains the 500.
    - `GET /api/v1/execution/tasks/execution/{workflowId}` also answers `500`; it is not used.
  - `POST /api/v1/execution/workflow/{name}/run` starts a run of the **running version** with the body as input (the
    editor's Run… dialog and the execution page's Run again). A run stores that input as `{ workflow: <body> }` with
    `workflowId` added; `reusableInput` unwraps it.

## Deployment (Docker, micro frontend)

- `Dockerfile`: production bundle served by nginx, which proxies `/api` and `/management` to `WM_BACKEND_URL` and
  adds `WM_TOKEN`. `docker/15-app-config.sh` checks the settings at startup, sets `<base href>` from
  `APP_BASE_PATH`, and writes `config.json` (`{ managed, backend, apps }`, from `APP_LINKS`). `core/deployment.ts`
  reads it. Keep the script, `core/deployment.ts` and the nginx template in step with `../process-orchestrator-ui`: only the
  `WM_` names and the context path (`/workflowmanager`) differ.
- The app is a micro frontend of `../configurator-portal`: the portal serves it under `/workflows/`, strips the prefix, and
  links the apps to each other. So **service URLs must stay relative**: always build them with `settings.url('/api/…')`,
  which returns `api/…` (resolved against `<base href>`) when no base URL is set. Never hard-code `/api`, never fetch
  from `/`, and keep `index.html`'s `<base href="/">` (the startup script rewrites it).
- Check the whole stack with `docker compose --env-file <file> -p <name> up -d --build --wait` at the repository root (`../docker-compose.yml`).
  Set `PORTAL_PORT`, the two service URLs and the two tokens in the env file. Point the services at throwaway backends
  for anything that publishes or runs. In Git Bash, set `MSYS_NO_PATHCONV=1` before `docker run -e APP_BASE_PATH=/x/`,
  or the path is rewritten into a Windows path.

## Domain rules that are easy to get wrong

These were confirmed by reading the engine or by running the service. Do not reverse them:

- **A workflow is identified by `name`**, not `label`. Tasks are identified by `label`.
- **The service lists only the version it runs**: the highest active, non-deprecated version whose activation date
  has passed. There is no endpoint to list other versions, or to activate or deactivate one. Deprecating is final,
  and the next lower active version then runs.
- **The create endpoint stores a fixed set of top-level fields** (`STORED_WORKFLOW_KEYS` in `core/model.ts`). Other
  top-level keys are dropped. The stored `description` and `version` come from `configurationDetails`.
  `suppressFailureOutputErrorList` is stored as `true` when absent.
- **`messengerProvider` is required** (`sync`, `jms`, `kafka`): a run cannot start without a messenger.
- **Task types with a dispatcher**: `simple`, `simpleThreadPool`, `multiStage`, `multiStepThreadPool`, `logical`,
  `decision`, `for`, `loop`, `manual`, `terminate` (and `parallel`). **`subFlow`, `validate` and `async` have none**
  in this service, even though their classes exist.
- The **`parallel`** task type is not used (it is flagged as an error): a team rule carried over from the Flow
  Configurator.
- **A decision's `default` must not hold tasks.** The dispatcher reads `default` as `{ tasks }`, the completion
  handler reads it as a list, and the run fails with a cast error after the first default task. Seen on the running
  service.
- **`loop`** runs its body, then again **until** `expression` is true.
- **HTTP tasks**: `inputParameters.{url, httpMethod, headers, body}`, or `inputParameters.endpoint` = the *name* of a
  configured route. In URL mode `headers` is required (it may be `{}`). `successCondition` and `rawRequest` sit on the
  task itself.
- **`retry`** may be a number or digits as text. **`retryDelay` must be text** (`"1000"`).
- **mapResolver**: `keys` = `{key1, key2, …}` (ordered by the number in the name); `map` = a nested object **or** a
  `${…}` expression.
- **SpEL**: Spring `TemplateParserContext("${", "}")`. The run input is `workflow` (`${workflow.email}`); finished
  tasks are `execution.<label>`. `{{name}}` placeholders outside `${}` are plain text.
- Logical tasks do not get `retry`.
- **Task executions are saved asynchronously**, so their ids are not in execution order. Order them by start time
  (`inRunOrder`).
- A run keeps the definition it used (`workflowDefinition`), so the execution page draws that, not the current version.

When a rule is unclear, read the backend (`<workflow-manager>/src/main/java/com/multicert/workflowmanager/`, mostly
`core/` and `service/api/v1/`), or run it on a throwaway instance. Ask the user when the code and the user's
description differ.

## Conventions

- **Pure logic in `core/`, rendering in `features/` and `shared/`.** Every rule gets a spec in `core/*.spec.ts`.
- The JSON document is the single source of truth. Edit it with `setAt` / `patch`, never by mutation. Keep unknown
  keys in the editor, and let validation say which ones the service will drop.
- The diagram emits intents (`insert` / `remove` / `move`); the editor applies them.
- **All styles go in `src/styles.scss`**, using the colour tokens (`var(--accent)`, `--run-ok`, …). Components have no
  style files. The file still holds the orchestrator diagram's styles from the original app; they are unused here.
- **Two designs, v1 and v2** (`<html data-design>`, switch in the top bar). Check UI changes in both designs (set
  `localStorage['wm-ui.design']`) and in light and dark. v2 styles are overrides under `[data-design='v2']` in the
  "Design v2" section. Never animate `transform` with `fill-mode: forwards/both` on a panel: a kept transform traps the
  `position: fixed` menus inside it.
- Anything clickable must work from the keyboard. Prefer a `<button>` or `<a>`. When that is not possible (rows with
  buttons inside), add the `keyActivate` directive: it makes the element a tab stop, and Enter/Space fire its `(click)`.
- Inspector controls show their own issues: add `[attr.data-field-sev]="fieldSev('<field>')"` (plus `aria-invalid` on
  native controls). `<field>` is the key under the selected node that the validator reports on, so new rules must pass
  the right `field` to `IssueCollector`.
- Text shown to users is plain and specific: say what is wrong and what will happen. Rule messages name the field.
- Templates (`TASK_TEMPLATES`) and samples must pass validation as created; the tests enforce this.

## Verifying UI changes in a real browser

Unit tests do not cover components. After any UI change, check it in headless Chrome with `tools/browser.mjs`
(navigate, `eval`, real mouse `click` / `hover` / `drag`, HTML5 `dragAndDrop`, `setDraft`, `screenshot`). The start
command and an example are in its header. Then **look at the screenshot**.

Lessons learned:

- **Write check scripts with the Write tool**, not bash heredocs or `node -e`. Quotes, backticks and `${…}` break in
  Git Bash, silently: the `${…}` just disappears from what is written.
- Match text with `textContent`: `innerText` follows CSS `text-transform` (e.g. "Failed" vs "failed").
- Elements outside the window cannot be clicked. Long menus scroll, and wrapped diagram rows can sit below the fold.
- Synthetic `className` reads right after dispatching an event see the state *before* Angular re-renders.
- Seed a known document with `page.setDraft('workflow', doc)` and reload, rather than clicking through *New*.
  `page.open()` to the route already shown changes nothing (hash routing, same component), so the editor keeps its
  document: open another route first, or `page.reload()`. The same goes for `localStorage['wm-ui.design']`: reload after
  setting it, or the running app writes its current design back.
- Saved pictures (SVG/PNG) download: allow it with `page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath })`.
- The editor's document changes only through `commit()` (undo history); see "Data flow in the editor" in the
  architecture doc.
- The theme follows `prefers-color-scheme`. Switch it with
  `page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })`.

## Gotchas

- Angular templates do not allow `new`. Move such logic into a component method.
- `[style.--x]` works for CSS custom properties: pass a string with the unit, e.g. `panels.left() + 'px'`.
- `input()` signals are not ready in field initialisers that run before binding. Load data in an `effect`, as
  `ExecutionDetail` does, since the page is reused when only the route param changes.
- The editor's diagram uses CSS `zoom` (via `DiagramViewport`). CSS `zoom` does not scale percentages: size the
  zoomed wrapper with plain `100%`, never `100% / zoom`. Fit measures a diagram's own edges, because workflows are
  centred.
- `position: fixed` menus (`TaskTemplateMenu`) avoid clipping by `overflow` panels. Keep new popovers fixed too.
- npm blocks install scripts in this environment (`allowScripts`); the build still works.
- The `font` shorthand (used on form controls) resets `font-variant-ligatures`, so the rule that turns off `!=`→`≠`
  ligatures sits at the **end** of `styles.scss`. Keep it last.
