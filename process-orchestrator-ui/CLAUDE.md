# CLAUDE.md

Working notes for AI-assisted development of the **Flow Configurator** (`process-orchestrator-ui`), an Angular app
that edits, validates, publishes and monitors the configurations of the service `<process-orchestrator>` (a separate checkout; see the root [CLAUDE.md](../CLAUDE.md)).
Read [docs/architecture.md](docs/architecture.md) for the code layout and
[docs/validation-rules.md](docs/validation-rules.md) for every rule and its backend source.

The sibling `../workflow-manager-ui` (Workflow Configurator) was copied from this app and shares the workflow editor,
the diagrams, the SpEL checker, the styles, and the editor and execution features (undo/redo, tabs, find,
shortcuts, copy/paste of tasks, publish change list, run dialogs, run comparison and health, picture export). When a
fix applies to both, make it in both.

## Commands

```bash
npm start                                   # dev server :4300, proxy /api,/management -> :8081/process-orchestrator
npm test                                    # vitest (ng test --watch=false), ~10 s
npx ng build --configuration development    # fast typecheck/build
npm run build                               # production build
```

- The dev server **live-reloads** on source and style changes. Restart it only after changing `angular.json`,
  `proxy.conf.json` or `src/environments/*`.
- Run the dev server and the backend with `run_in_background` and `timeout: 7200000`. When the background limit
  ends the wrapper task, the server process usually keeps running, so check the port before restarting. Restarting
  a second copy on a busy port fails.
- To stop by port (PowerShell): `Get-NetTCPConnection -LocalPort 4300 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`.

## Backend (needed for references, library, executions, publish)

- Start it with `cd <process-orchestrator> && JAVA_HOME=~/.jdks/ms-21.0.12 PATH=~/.jdks/ms-21.0.12/bin:$PATH ./mvnw -o`.
  The default JDK is 17, which the build's enforcer rejects. Startup takes about 40 s; health is at
  `http://localhost:8081/process-orchestrator/management/health`.
- **Context path `/process-orchestrator`**. `proxy.conf.json` rewrites `/api` to `/process-orchestrator/api`.
- **Port 8081 is shared** with other local services (workflow-manager). An empty `404` on `/management/health` means
  another app holds the port.
- **Auth**: the service has no login endpoint. The dev token lives in `src/environments/environment.development.ts`
  (git-ignored). It is signed HS512 with the service's dev secret (`application-secret-samples.yml`), with
  `auth: "ROLE_ADMIN ROLE_USER"`. Use it for `curl`:
  `T=$(grep -o "devToken: '[^']*" src/environments/environment.development.ts | cut -c12-)`.
- **A throwaway instance** leaves the port and the dev database alone. Use it for checks that publish or start flows:
  `JAVA_HOME=~/.jdks/ms-21.0.12 PATH=~/.jdks/ms-21.0.12/bin:$PATH ./mvnw -o -Dspring-boot.run.arguments="--server.port=8084 --spring.datasource.url=jdbc:h2:mem:poui;DB_CLOSE_DELAY=-1"`,
  then `npx ng serve --proxy-config <copy of proxy.conf.json targeting 8084>`. Its database starts empty.
- `POST /api/v1/orchestrator/execution/workflow/start` (`{ orchestrationFlow, owner, channel, requestContext }`) starts a
  flow of the **active** version (the editor's Run… dialog and the execution page's Run again). A failing activity
  answers `422` without the flow's id.
- Useful endpoints: `/api/v1/{workflow|orchestrator}` (list, `/{name}/versions`, `/{name}/active`, `/create`,
  `/{name}/versions/{v}/{activate|deactivate|deprecate}`), and read-only `/api/v1/{flow-traces|step-traces|orchestrator-execution-traces|entity-workflow-executions|entity-task-executions}`
  with JHipster criteria filters (`field.equals`, `.in`, `.contains`) and `X-Total-Count`.

## Deployment (Docker, micro frontend)

- `Dockerfile`: production bundle served by nginx, which proxies `/api` and `/management` to `PO_BACKEND_URL` and
  adds `PO_TOKEN`. `docker/15-app-config.sh` checks the settings at startup, sets `<base href>` from
  `APP_BASE_PATH`, and writes `config.json` (`{ managed, backend, apps }`, from `APP_LINKS`). `core/deployment.ts`
  reads it. Keep the script, `core/deployment.ts` and the nginx template in step with `../workflow-manager-ui`: only the
  `PO_` names and the context path (`/process-orchestrator`) differ.
- The app is a micro frontend of `../configurator-portal`: the portal serves it under `/flows/`, strips the prefix, and
  links the apps to each other. So **service URLs must stay relative**: always build them with `settings.url('/api/…')`,
  which returns `api/…` (resolved against `<base href>`) when no base URL is set. Never hard-code `/api`, never fetch
  from `/`, and keep `index.html`'s `<base href="/">` (the startup script rewrites it).
- Check the whole stack with `docker compose --env-file <file> -p <name> up -d --build --wait` at the repository root (`../docker-compose.yml`).
  Set `PORTAL_PORT`, the two service URLs and the two tokens in the env file. Point the services at throwaway backends
  for anything that publishes or runs. In Git Bash, set `MSYS_NO_PATHCONV=1` before `docker run -e APP_BASE_PATH=/x/`,
  or the path is rewritten into a Windows path.

## Domain rules that are easy to get wrong

These were confirmed with the user, or by reading the engine. Do not reverse them:

- **Automatic steps and activities are 1 to 1.** Exactly one predecessor, and they are its only successor.
  **Manual** ones may have several paths in and out. The engine starts the *first* automatic successor and returns
  (`Automatic{Step,Activity}Controller`).
- `previousStep` / `previousActivity` links are matched with `contains`, so a node with several predecessors can
  start after **any** of them.
- The flow starts at the first step without `previousStep`, and each step at its first activity without
  `previousActivity`.
- The **`parallel`** task type is not used (it is flagged as an error).
- **HTTP tasks**: `inputParameters.{url, httpMethod, headers, body}`, or `inputParameters.endpoint` = the *name* of a
  configured route. `successCondition` and `rawRequest` sit on the task itself.
- **mapResolver**: `keys` = `{key1, key2, …}` (ordered by the number in the name); `map` = a nested object **or** a
  `${…}` expression.
- **Decision**: `cases: [{key, tasks}]`; `default` is optional.
- **SpEL**: Spring `TemplateParserContext("${", "}")`. `{{name}}` placeholders outside `${}` are plain text.
- Logical tasks do not get `retry`.

When a rule is unclear, read the backend (`<process-orchestrator>/src/main/java/.../engine/`), or the workflow-core
jar with `javap -c -p` (jar: `~/.m2/repository/com/multicert/commons/workflow-core/0.1.4-SNAPSHOT/`; there is no
sources jar). Ask the user when the code and the user's description differ.

## Conventions

- **Pure logic in `core/`, rendering in `features/` and `shared/`.** Every rule and every geometry change gets a
  spec in `core/*.spec.ts`.
- The JSON document is the single source of truth. Edit it with `setAt` / `patch`, never by mutation. Keep unknown
  keys.
- Diagrams emit intents (`DiagramEdit`, `insert` / `remove` / `move`); editors apply them.
- **All styles go in `src/styles.scss`**, using the colour tokens (`var(--accent)`, `--run-ok`, …). Components have no
  style files.
- **Two designs, v1 and v2** (`<html data-design>`, switch in the top bar). Check UI changes in both designs (set
  `localStorage['po-ui.design']`) and in light and dark. v2 styles are overrides under `[data-design='v2']` in the
  "Design v2" section. Never animate `transform` with `fill-mode: forwards/both` on a panel: a kept transform traps the
  `position: fixed` menus inside it.
- Anything clickable must work from the keyboard. Prefer a `<button>` or `<a>`. When that is not possible (rows with
  buttons inside, SVG `<g>`), add the `keyActivate` directive: it makes the element a tab stop, and Enter/Space fire its `(click)`.
- Inspector controls show their own issues: add `[attr.data-field-sev]="fieldSev('<field>')"` (plus `aria-invalid` on
  native controls). `<field>` is the key under the selected node that the validator reports on, so new rules must pass
  the right `field` to `IssueCollector`.
- Text shown to users is plain and specific: say what is wrong and what will happen. Rule messages name the field.
- Templates (`TASK_TEMPLATES`) must pass validation as created; the templates test enforces this.

## Verifying UI changes in a real browser

Unit tests do not cover components. After any UI change, check it in headless Chrome with `tools/browser.mjs`
(navigate, `eval`, real mouse `click` / `hover` / `drag`, HTML5 `dragAndDrop`, `setDraft`, `screenshot`). The start
command and an example are in its header. Then **look at the screenshot**.

Lessons learned:

- **Write check scripts with the Write tool**, not bash heredocs. Heredocs with quotes or `${…}` break in Git Bash
  ("unexpected EOF").
- Match text with `textContent`: `innerText` follows CSS `text-transform` (e.g. "Failed" vs "failed").
- Elements outside the window cannot be clicked. Long menus scroll, and wrapped diagram rows can sit below the fold.
- Synthetic `className` reads right after dispatching an event see the state *before* Angular re-renders.
- In Git Bash, run check scripts that take a route with `MSYS_NO_PATHCONV=1`: otherwise `/workflow` reaches node as
  `C:/Program Files/Git/workflow`, and the app's `**` route silently shows its default editor instead.
- Seed a known document with `page.setDraft('workflow' | 'orchestrator', doc)` (it replaces the editor's tabs with one
  tab) and reload, rather than clicking through *New*. `page.open()` to the route already shown changes nothing (hash routing, same component): open another
  route first, or `page.reload()`. The same goes for `localStorage['po-ui.design']`: reload after setting it.
- Saved pictures (SVG/PNG) download: allow it with `page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath })`.
- An editor's document changes only through `commit()` (undo history); see "Data flow in an editor" in the
  architecture doc.

## Gotchas

- Angular templates do not allow `new`. Move such logic into a component method.
- `[style.--x]` works for CSS custom properties: pass a string with the unit, e.g. `panels.left() + 'px'`.
- `input()` signals are not ready in field initialisers that run before binding. Load data in an `effect`, as
  `ExecutionDetail` does, since the page is reused when only the route param changes.
- The SVG diagram uses CSS `zoom` (via `DiagramViewport`). Use `getScreenCTM()` to convert pointer coordinates.
  CSS `zoom` does not scale percentages: size the zoomed wrapper with plain `100%`, never `100% / zoom`. Fit measures
  a diagram's own edges, because workflows are centred.
- `position: fixed` menus (`TaskTemplateMenu`) avoid clipping by `overflow` panels. Keep new popovers fixed too.
- npm blocks install scripts in this environment (`allowScripts`); the build still works.
- The `font` shorthand (used on form controls) resets `font-variant-ligatures`, so the rule that turns off `!=`→`≠`
  ligatures sits at the **end** of `styles.scss`. Keep it last.
