# Architecture

An Angular 22 standalone app: signals, zoneless change detection, built-in control flow, Vitest. It has no UI
library and no state library. The diagram is plain HTML computed from the JSON document.

The app started as a copy of the Flow Configurator (`../process-orchestrator-ui`). The editor, diagram, SpEL checker
and styles are shared with it. The API layer, the validator's rules, the library and the execution pages are specific
to workflow-manager.

## Principles

1. **The JSON document is the single source of truth.** The editor holds one `signal<WorkflowDefinition>`. The
   outline, diagram, inspector, JSON tab and validation are all `computed` from it. Every edit replaces the document
   immutably (`setAt`), so change detection comes for free.
2. **Unknown fields are never dropped by the editor.** Interfaces carry index signatures, and edits only touch the
   keys they own. The service is stricter: its create endpoint stores a fixed set of top-level fields. Validation
   reports every field that will not survive publishing, instead of the editor removing it.
3. **Rules live in pure functions** (`core/workflow-validator.ts`, `core/spel.ts`): no Angular, unit tested, and each
   one traceable to backend code (see [validation-rules.md](validation-rules.md)).
4. **The app follows what the service's API allows**, and says so in the UI: one visible version per workflow, no
   activation after publishing.

## Layout of `src/app`

```
app.ts / app.routes.ts / app.config.ts   shell, lazy routes, HttpClient + auth interceptor, hash routing,
                                          route params bound to component inputs

core/                                     framework-free logic (plus a few root services)
  model.ts                  payload shapes + the vocabulary the backend knows (stored keys, types, components)
  json-path.ts              JsonPath, getAt / setAt (immutable) / parsePath / pathToString
  issues.ts                 Issue, IssueCollector, severity helpers
  workflow-validator.ts     every rule; childTaskLists() (where nested task lists live); ValidationContext
  spel.ts                   SpEL template scanner + recursive-descent parser; findSpelProblems()
  task-templates.ts         "add task" templates, httpFields(), isLogicalTask()
  task-moves.ts             moveTask() across task lists (used by outline and diagram drag-and-drop)
  task-clipboard.ts         copy / paste / duplicate: parseTasks(), prepareForPaste() (renames taken labels and the
                            execution.<label> references to them), labelsIn(), forEachTask()
  history.ts                History<T>: undo / redo, quick edits of one field merge into one step
  diff.ts                   diffWorkflows() (stored form, tasks matched by label, moves by LCS), diffValues(),
                            unstoredKeys(), preview()
  run-input.ts              inputSkeleton() (the workflow.<path> keys a definition reads), reusableInput(),
                            the last input sent per workflow (localStorage)
  executions.ts             run types, toWorkflowRun() / toTaskRun() (read the stored rows), inRunOrder(),
                            buildTaskOverlay() (task executions → diagram colours), summarizeRuns() (health),
                            compareTaskRuns(), formatting
  samples.ts                starter documents
  drafts.ts                 localStorage draft; saved drafts list (keepDraft / listSavedDrafts / forgetDraft);
                            queueOpen()/takeQueuedOpen() hand-off between pages
  config-api.service.ts     create, list / read the running versions, deprecate; toStored(); describeHttpError()
  executions-api.service.ts /api/v1/execution: workflow list (and latest(name)), one workflow, task list,
                            failedTasks(ids), start(name, input)
  workflow-catalog.service.ts running workflows → WorkflowCatalog for reference checks and dropdowns
  settings.service.ts       base URL + JWT (localStorage; dev token from environment.development.ts)
  deployment.ts             config.json of a Docker deployment (managed connection, portal app links), relative service URLs
  design.service.ts         design v1 | v2
  panel-sizes.service.ts    side panel widths
  auth.interceptor.ts       adds Authorization: Bearer

shared/                     reusable UI
  diagram-viewport.ts       scroll + zoom (CSS zoom) + pan + Fit
  issues-panel.ts           validation list
  json-field.ts             JSON value editor (object fields)
  json-document.ts          whole-document JSON tab
  auto-grow.ts              textarea[autoGrow] (grows with content; singleLine blocks Enter)
  task-template-menu.ts     "+" button → fixed-position template menu
  workflow-select.ts        dropdown of running workflows (failure / rejection workflow)
  publish-dialog.ts         version details + the changes from the running version + create
  run-dialog.ts             input + start a run of the running version, then link to the execution
  shortcuts-dialog.ts       the editor's keyboard shortcuts (EDITOR_SHORTCUTS)
  dialog-focus.ts           Tab trap shared by the dialogs
  diagram-export.ts         a diagram as an SVG / PNG picture (styles inlined, pseudo-elements made real, fonts embedded)
  design-switch.ts          v1 | v2 switch
  download.ts               save a value as a JSON file
  key-activate.ts           keyboard activation for non-button elements
  resize-handle.ts          side-panel drag handle

features/
  workflow/      workflow-editor (+ .html), task-flow (recursive HTML diagram; `run` input colours it by an
                 execution), task-drag.service
  library/       the running version of every workflow
  executions/    executions-list (+ health of one workflow, pick two to compare), execution-detail (+ .html),
                 execution-compare (two runs side by side)
  settings/      connection settings
```

`src/styles.scss` holds **all** styles: colour tokens with dark and light themes, layout, diagram, executions.
Components have no style files. This keeps the component-style size budget out of the way, and keeps the theme in
one place. It still contains the styles of the original app's orchestrator diagram and overview pages, which nothing
here uses.

**Two designs.** `DesignService` holds the design, `v1` (original) or `v2` ("soft structural" redesign). It is stored
in localStorage (`wm-ui.design`) and applied as `<html data-design="v2">`. An inline script in `index.html` applies the
saved value before the first paint. Markup is the same in both designs. The "Design v2" section of `styles.scss` only
overrides v1 for `[data-design='v2']`.

## Data flow in the editor

```
              ┌──────────── edits (inspector, outline, diagram events, JSON tab) ───────────┐
              ▼                                                                              │
   config: signal<WorkflowDefinition>  ──computed──►  issues  ──► severityByNode ──► outline / diagram / panel
              │                                   └─► rootItems ──► diagram
              └──effect──► saveDraft (localStorage)
   WorkflowCatalogService.catalog ───────► (input to validation: reference checks)
```

The diagram emits **intents**, not mutations: `TaskFlow` emits `insert`, `remove`, `move`, bubbling up through nested
flows. The editor applies the intent to the document.

**Every edit goes through `WorkflowEditor.commit(next, group?)`**, which records the document it replaces in
`History`. Never `config.set` directly, or the edit cannot be undone. `group` is the edited field's path: quick edits of
the same field (typing) undo as one step. Undo / redo bind Ctrl+Z / Ctrl+Y at the document level, also inside fields,
because bound field values break the browser's own undo. Deleting a task or replacing the document (New, Sample,
Import, a draft) asks no confirmation: it can be undone, and a replaced document goes to the drafts list first
(`keep()`; untouched starters are not kept).

Keyboard and clipboard: the editor listens on `document` (`keydown`, `copy`, `cut`, `paste`). Keys other than undo,
redo and Ctrl+F apply only when focus is not in a text field (`isTyping`), and copy is left to the browser when text is
selected. Pasted tasks go after the selected task. Shortcuts are listed in `EDITOR_SHORTCUTS`; keep that list in step
with `onKeydown`.

Find: `matchRows` (outline order) feeds the outline (`.match` / `.dim`) and `TaskFlow`'s `matches` input. Diagram nodes
carry `data-path`, and outline rows `data-key`, so `reveal()` can scroll a task into view.

## Workflow diagram

`TaskFlow` is a recursive component: a column of tasks. For a **decision** it renders one column per case, plus
`default`, or the implicit *no match* column. CSS `::before` / `::after` on each column draw the split and join
bars from the first column's centre to the last's. A `for` or `loop` task renders a loop box around a nested
`TaskFlow`. Hover controls and drag-and-drop live in the same component. `TaskDragService` (provided by the workflow
editor) shares the drag state across the nested instances.

With a `run` input (node path → `NodeRun`), every task node gets `data-run` with its outcome, or `none` when the
execution never reached it. A task that ran more than once shows a `×n` badge.

## Talking to the service

| Need | Call | Notes |
|---|---|---|
| Publish | `POST /api/v1/configuration/business-logic/entity-type/workflow` | `{ configurationDetails, workflowConfiguration }` |
| Running versions | `GET /api/v1/deployment/entity-type/WORKFLOW` | the definition is JSON text in `payload`; `toStored` parses it |
| One running version | `GET …/entity-type/WORKFLOW/entity-name/{name}` | `500 "Entity Not Found"` means none; `running()` returns `null` |
| Deprecate | `POST /api/v1/deployment/deprecate/entity-type/WORKFLOW/entity-name/{name}/version/{v}` | final |
| Executions | `GET /api/v1/execution/workflow` | criteria filters; the workflow name is the `label` column. Service builds from before its 2026-10-13 fix answer `500 "is not a valid HTTP URL"`; the page shows that error |
| One execution | `GET /api/v1/execution/workflow/workflowid/{id}` | parsed; an unknown id gives `200` with an empty body |
| Task executions | `GET /api/v1/execution/tasks?workflowId.equals=…` | ids follow the save order, so sort with `inRunOrder`; no output in these rows |
| Latest runs of one workflow | `GET /api/v1/execution/workflow?label.equals=…&sort=id,desc` | health summary; with `createTime.greaterThanOrEqual` to find a run just started |
| Failed tasks of many runs | `GET /api/v1/execution/tasks?workflowId.in=…&status.equals=FAILED` | one call for the health summary |
| Start a run | `POST /api/v1/execution/workflow/{name}/run` | body = input. `sync`: answers when the run ends (200, 400 if failed, or the outputs' `httpCode`) with `workflowId`, unless the outputs have a `body`; other messengers: 202, empty. Without an id, the dialog looks up the newest run since just before it started |

## Executions

`ExecutionDetail` loads, for one `workflowId`, the execution row and its task executions. The row holds the
definition the run used (`workflowDefinition`), so the diagram is drawn on that. Only when a row has none does the
page fall back to the version running now, and say so.

`buildTaskOverlay()` maps task executions to diagram paths by label. Executions of the same label add up to
`attempts`, and the last one decides the colour. Executions it cannot place are listed under the diagram.

The run keeps each task as the engine last saved it, in its `execution` map (nested for loops and cases): the evaluated fields, the
output and the error. `findTaskTrace` looks the selected task up there.

A run keeps its input as `{ workflow: <request body> }`, with `workflowId` added (`WorkflowService.internalCreate`).
"Run again" sends `reusableInput(inputs)`, which unwraps it.

The service runs its published version, not the editor's document. The run dialog compares the two with
`diffWorkflows` and says when they differ.

`ExecutionCompare` (`/executions/compare/:a/:b`) lines up two runs: facts, task by task (`compareTaskRuns`), and the
differences in input, output and definition. The executions list shows the health of one workflow
(`summarizeRuns` over its last 50 runs) when the name filter is exactly its name.

## Extending

### Add a validation rule

1. Find the backend behaviour, cite the class in a comment, and add the check to `core/workflow-validator.ts`. Use
   `IssueCollector` with the node path (for highlighting) and the field (for the message).
2. Add a case to `core/workflow-validator.spec.ts`.
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
`childTaskLists()`; the outline, validation, moves and the execution overlay all use that. Then add rendering in
`TaskFlow.branches()` and the template's `@switch`. If the service later registers `subFlow`, `validate` or `async`,
also remove the type from `UNREGISTERED_TASK_TYPES`.

### Add a page

Create a standalone component under `features/…`, add a lazy route in `app.routes.ts`, and a link in `app.ts`.

## Testing

`npm test` runs Vitest over:

- `core/*.spec.ts`: the validator, SpEL, moves, issue helpers, execution mapping, history, diff, clipboard, run
  input, saved drafts, run summary and comparison;
- `app.spec.ts`.

Components are verified in a real browser with `tools/browser.mjs` (see [CLAUDE.md](../CLAUDE.md)).
