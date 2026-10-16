# Architecture

An Angular 22 standalone app: signals, zoneless change detection, built-in control flow, Vitest. It has no UI
library and no state library. The diagrams are plain SVG and HTML computed from the JSON documents.

## Principles

1. **The JSON document is the single source of truth.** Each editor holds one `signal<…Config>`. The outline,
   diagram, inspector, JSON tab and validation are all `computed` from it. Every edit replaces the document
   immutably (`setAt`), so undo-friendly diffs and change detection come for free.
2. **Unknown fields are never dropped.** The service reads payloads as `MapObject`s (typed views over raw maps).
   Interfaces carry index signatures, and edits only touch the keys they own.
3. **Rules live in pure functions** (`core/*-validator.ts`, `core/spel.ts`): no Angular, unit tested, and each one
   traceable to backend code (see [validation-rules.md](validation-rules.md)).
4. **Geometry is pure too** (`core/orchestrator-layout.ts`), so layouts are unit tested. Components only render.

## Layout of `src/app`

```
app.ts / app.routes.ts / app.config.ts   shell, lazy routes, HttpClient + auth interceptor, hash routing,
                                          route params bound to component inputs

core/                                     framework-free logic (plus a few root services)
  model.ts                  payload shapes + the vocabulary the backend knows (types, components, actions)
  json-path.ts              JsonPath, getAt / setAt (immutable) / parsePath / pathToString
  issues.ts                 Issue, IssueCollector, severity helpers
  orchestrator-validator.ts orchestrator rules; ValidationContext { workflows?: WorkflowCatalog }
  workflow-validator.ts     workflow rules; childTaskLists() (where nested task lists live)
  spel.ts                   SpEL template scanner + recursive-descent parser; findSpelProblems()
  dag.ts                    entries / parents / cycles / reachability / depth for previous* links
  orchestrator-layout.ts    step + activity geometry, row wrapping, lanes, ports, edge paths
  task-templates.ts         "add task" templates, httpFields(), isLogicalTask()
  task-moves.ts             moveTask() across task lists (used by outline and diagram drag-and-drop)
  task-clipboard.ts         copy / paste / duplicate: parseTasks(), prepareForPaste() (renames taken labels and the
                            execution.<label> references to them), labelsIn(), forEachTask()
  history.ts                History<T>: undo / redo, quick edits of one field merge into one step
  editor-tabs.ts            open tabs (pure): openTab() / closeTab() / selectTab() / updateActive(), validTabs()
  diff.ts                   diffWorkflows() (tasks by label), diffOrchestrators() (steps by label, activities by step and
                            label), moves by LCS; diffValues(), preview()
  run-input.ts              requestContextSkeleton() (the workflow.requestContext.<path> keys the flow's workflows
                            read), workflowLabelsOf(), startInputOf() (a flow's start request), the last input per flow
  executions.ts             trace types, buildRunOverlay() (traces → diagram colours), summarizeFlows() (health),
                            compareActivityRuns(), formatting
  samples.ts                starter documents
  drafts.ts                 open tabs in localStorage (loadTabs / saveTabs; the old single draft becomes the first
                            tab once); closed-tabs list (keepDraft / listSavedDrafts / forgetDraft);
                            queueOpen()/takeQueuedOpen() hand-off between pages
  config-api.service.ts     /api/v1/{workflow|orchestrator}: list, versions, active, create, activate/…
  executions-api.service.ts flow-traces (and latest(flowName)), step-traces, orchestrator-execution-traces (one flow or
                            many), entity-*-executions (and failedWorkflows(ids)), start(request)
  workflow-catalog.service.ts stored workflows → WorkflowCatalog for reference checks and dropdowns
  settings.service.ts       base URL + JWT (localStorage; dev token from environment.development.ts)
  deployment.ts             config.json of a Docker deployment (managed connection, portal app links), relative service URLs
  panel-sizes.service.ts    side panel widths
  auth.interceptor.ts       adds Authorization: Bearer

shared/                     reusable UI
  diagram-viewport.ts       scroll + zoom (CSS zoom) + pan + Fit; reports available width
  editor-tabs.ts            the tab bar, in the editor's toolbar row: ✖ (errors) or a dot (edited since opened
                            or published, `isEdited()` against the tab's `base`) per tab, close, the "+" menu,
                            and the ARIA tabs keyboard (only the shown tab is a tab stop; its keys stop there)
  issues-panel.ts           validation list
  json-field.ts             JSON value editor (object fields)
  json-document.ts          whole-document JSON tab
  auto-grow.ts              textarea[autoGrow] (grows with content; singleLine blocks Enter)
  task-template-menu.ts     "+" button → fixed-position template menu
  workflow-select.ts        dropdown of stored workflows
  publish-dialog.ts         version details + the changes from the active (else newest) version + POST …/create
  run-dialog.ts             owner, channel and request context + start a flow of the active orchestrator version
  shortcuts-dialog.ts       keyboard shortcuts (WORKFLOW_SHORTCUTS, ORCHESTRATOR_SHORTCUTS)
  dialog-focus.ts           Tab trap shared by the dialogs
  diagram-export.ts         a diagram (HTML or SVG) as an SVG / PNG picture (styles inlined, fonts embedded)
  download.ts               save a value as a JSON file
  resize-handle.ts          side-panel drag handle

features/
  orchestrator/  orchestrator-editor (+ .html), orchestrator-diagram (SVG; editable mode emits DiagramEdit)
  workflow/      workflow-editor (+ .html), task-flow (recursive HTML diagram), task-drag.service
  library/       stored configurations
  executions/    executions-list (+ health of one flow, pick two to compare), execution-detail (+ .html),
                 execution-compare (two runs side by side)
  settings/      connection settings
  overview/      showcase pages, linked from the brand: overview (/overview, design v1, dark-only) and overview-v2
                 (/overview/v2, design v2, light). Each has its own floating nav (the app's top bar hides there).
                 Shared copy in overview-content.ts and behaviour in showcase-page.ts. Their claims must stay true to
                 the app; the template list is read from TASK_TEMPLATES.
```

`src/styles.scss` holds **all** styles: colour tokens with dark and light themes, layout, diagrams, executions.
Components have no style files. This keeps the component-style size budget out of the way, and keeps the theme in
one place.

**Two designs.** `DesignService` (`core/design.service.ts`) holds the design, `v1` (original) or `v2` ("soft
structural" redesign). It is stored in localStorage (`po-ui.design`) and applied as `<html data-design="v2">`. An inline
script in `index.html` applies the saved value before the first paint. The v1 | v2 switch (`shared/design-switch.ts`)
is in the top bar and in the overview pages' nav. Markup is the same in both designs. The "Design v2" section of
`styles.scss` only overrides v1 for `[data-design='v2']`, so a new screen gets v2 tokens for free but may need a v2 rule
for its panels. That section must stay before the Overview sections.

## Data flow in an editor

```
              ┌──────────── edits (inspector, outline, diagram events, JSON tab) ───────────┐
              ▼                                                                              │
   config: signal<Config>  ──computed──►  issues  ──► severityByNode ──► outline / diagram / panel
              │                       └─► layout (orchestrator) / rootItems (workflow) ──► diagram
              └──setDocument──► tabs (the shown tab) ──effect──► saveTabs (localStorage)
   WorkflowCatalogService.catalog ───────► (input to validation: reference checks)
```

The diagrams emit **intents**, not mutations:

- the orchestrator diagram emits `DiagramEdit`: `add-step`, `add-activity`, `remove`, `link`, `unlink`;
- the workflow `TaskFlow` emits `insert`, `remove`, `move`, bubbling up through nested flows.

The editor applies the intent to the document. Links are stored as `previousStep` / `previousActivity` on the node
that runs **after**.

**Every edit goes through the editor's `commit(next, group?)`**, which records the document it replaces in `History`.
Never `config.set` directly, or the edit cannot be undone. `group` is the edited field's path: quick edits of the same
field (typing) undo as one step. Undo / redo bind Ctrl+Z / Ctrl+Y at the document level, also inside fields, because
bound field values break the browser's own undo. commit() and undo / redo write the document into the shown tab
(`setDocument()`). Deleting a node asks no confirmation: it can be undone.

**Tabs** (both editors): each open document is a tab (`tabs: signal<TabsState>`; `config` is the shown tab's
document). New, Sample, Import, a stored version and a run's configuration open in a new tab (`openDocument()`);
Import, stored versions and reopened tabs show an open tab holding the same document instead. Each tab has its own
`History` and selection, kept in memory by tab id. Closing a tab asks no confirmation: its document goes to the
closed-tabs list first (`keep()`; untouched starters are not kept), and closing the last tab leaves a new one.

Keyboard: both editors listen on `document`. Keys other than undo, redo and Ctrl+F apply only when focus is not in a
text field (`isTyping`). The workflow editor also handles `copy` / `cut` / `paste` (tasks as JSON, pasted after the
selected task). In the orchestrator editor, Escape and Delete are left to the diagram while a link is selected
(`.edge.sel`). Keep `WORKFLOW_SHORTCUTS` / `ORCHESTRATOR_SHORTCUTS` in step with `onKeydown`.

Find: `matchRows` (outline order) feeds the outline (`.match` / `.dim`) and the diagram's `matches` input. Diagram
nodes carry `data-path` (workflow) or `data-node` (orchestrator), and outline rows `data-key`, so `reveal()` can
scroll a node into view.

These features are shared with the Workflow Configurator (`../workflow-manager-ui`): fix them in both.

## Orchestrator layout

`layoutOrchestrator(config, maxWidth)` works in five passes:

1. **Size each step** from its activities. Activities are placed in rows by `previousActivity` depth. Links that
   skip rows get a lane on the step's right side, which widens the step.
2. **Columns**: steps are grouped by `previousStep` depth. Columns are packed into **rows** that fit `maxWidth`. The
   diagram passes the viewport width divided by the zoom.
3. **Classify each link**: `next` (to the next column, curving sideways), `over` (skips columns: up into a lane
   above the row), or `wrap` (to another row, or backwards: down into a lane below the row). Lanes are assigned by
   position, so parallel connectors do not cross.
4. **Place the rows**, leaving room for their lanes.
5. **Ports**: every link gets its own entry and exit point, so joins and forks stay readable.

## Workflow diagram

`TaskFlow` is a recursive component: a column of tasks. For a **decision** it renders one column per case, plus
`default`, or the implicit *no match* column. CSS `::before` / `::after` on each column draw the split and join
bars from the first column's centre to the last's. A `for` task renders a loop box around a nested `TaskFlow`.
Hover controls and drag-and-drop live in the same component. `TaskDragService` (provided by the workflow editor)
shares the drag state across the nested instances.

## Executions

`ExecutionDetail` loads, for one `orchestratorId`:

- the flow trace, step traces and activity runs;
- the workflow executions and task executions for every run's `activityId` (`workflowId.in=…`);
- the orchestrator configuration: the active version, or else the newest.

`buildRunOverlay()` maps runs to diagram paths. Retries add up to `attempts`. Cancellation runs are attached to the
activity whose `cancellationActivity.label` matches. Runs it cannot place are listed under the diagram. The
diagram's `run` input switches its colours to the run's outcome.

A flow's first activity run records the whole start request as its `input` (`{ orchestrationFlow, owner, channel,
requestContext, orchestrationId }`); `startInputOf` reads it back for "Run again" and the compare page. An activity
run's `output` repeats its input (the trace mapper maps both from `inputs`), so outputs come from the workflow
executions.

Starting a flow (`POST /api/v1/orchestrator/execution/workflow/start`) runs the **active** orchestrator version, not the
editor's document; the run dialog compares the two with `diffOrchestrators`. It answers `200` with `orchestrationId`
and `flowDefinitionAPI.complete`, or `422` (problem `detail`: which activity failed) without the id, so the dialog then
looks up the newest flow since just before it started.

`ExecutionCompare` (`/executions/compare/:a/:b`) lines up two flows: facts, activity by activity
(`compareActivityRuns`), and the differences in start request and last workflow outputs. The executions list shows the
health of one flow (`summarizeFlows` over its last 50 runs, their activity runs and failed workflow executions) when the
flow filter is exactly its name.

## Extending

### Add a validation rule

1. Find the backend behaviour, cite the class in a comment, and add the check to the matching validator. Use
   `IssueCollector` with the node path (for highlighting) and the field (for the message).
2. Add a case to the validator's spec (`*.spec.ts`).
3. Document it in [validation-rules.md](validation-rules.md).
4. Check that the samples and templates still pass (`accepts the sample …` and the templates test).

### Add a task component

1. Add the name to `KNOWN_COMPONENTS` (`core/model.ts`).
2. Add its required fields to `validateComponent` (`core/workflow-validator.ts`).
3. Add a template to `TASK_TEMPLATES` (`core/task-templates.ts`). The templates test requires it to be valid as
   created.
4. Optionally add an inspector section (`features/workflow/workflow-editor.html`), for example a `fieldset`
   guarded by `t.component === '…'`.

### Add a task type

Add it to `TASK_TYPES` and to the `switch` in `validateTask`. If it holds nested tasks, add it to
`childTaskLists()`; the outline, validation and moves all use that. Then add rendering in `TaskFlow.branches()` and
the template's `@switch`.

### Add a page

Create a standalone component under `features/…`, add a lazy route in `app.routes.ts`, and a link in `app.ts`.

## Testing

`npm test` runs Vitest over:

- `core/*.spec.ts`: validators, SpEL, DAG and layout, moves, execution mapping, history, diff, clipboard, run input,
  open and closed tabs, flow summary and comparison;
- `app.spec.ts`.

Components are verified in a real browser with `tools/browser.mjs` (see [CLAUDE.md](../CLAUDE.md)).
