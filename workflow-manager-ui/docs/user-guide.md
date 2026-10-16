# User guide

How to use each screen of the Workflow Configurator. For the reason behind each check, see
[validation-rules.md](validation-rules.md).

## Concepts

- A **workflow** is a list of **tasks** that run one after another. It is identified by its **name**.
- A **task** is identified by its **label**. Its **type** decides how it runs:
  - worker types (`simple`, `simpleThreadPool`, `multiStage`, `multiStepThreadPool`) run a **component**: `http`,
    `logical`, `notification`, `mapResolver`, `bash`, `print`, `randomInt`, `sleep`;
  - `logical` checks an expression;
  - `decision` runs the case whose key equals its expression;
  - `for` runs its body once per element of a list;
  - `loop` runs its body, then again until its expression is true;
  - `manual` stops the workflow until it is resumed from outside;
  - `terminate` ends the workflow.
- Values can be **expressions**: `${…}` holds SpEL. The run's input is `workflow` (`${workflow.email}`), and each
  finished task is `execution.<label>` (`${execution.login.output.body.token}`).
- The service keeps **versions** of a workflow. It runs one of them: the highest version that is active, not
  deprecated, and whose activation date has passed.

## The workflow editor

The page has three columns and a validation bar:

- **Outline** (left): the workflow and its tasks as a tree. Click a row to select it. Drag a task to move it, also
  into or out of cases and loops. The arrows move a task within its list, and ✕ deletes it.
- **Diagram** (middle): the same workflow drawn top to bottom. The **JSON** tab shows the raw document, which you
  can edit as text.
- **Inspector** (right): a form for the selected task, or for the workflow when nothing is selected.
- **Validation** (bottom): every problem found. Click one to go to its task and field.

Your work is kept in the browser as a draft, so a reload does not lose it. Nothing reaches the service until you
publish.

### Toolbar

| Button | What it does |
|---|---|
| **New** | Replaces the document with a one-task workflow. |
| **Sample** | Replaces the document with a sample that uses a decision, notifications and an HTTP call. |
| **Import** | Opens a JSON file: a bare definition, a full create request, or a stored version from the service. |
| **Export** | Saves the definition as `<name>.json`. |
| **Copy JSON** | Copies the definition to the clipboard. |
| **Publish** | Creates a new version in the service. Disabled while any error remains. |

### Reading the diagram

- Tasks run from **start** to **end**.
- A **decision** fans out into one column per case, labelled with its key. The last column, **no match**, is the
  path taken when no key equals the expression: nothing runs.
- A **for** or **loop** task draws a box around its body.
- A badge on a task shows its worst problem: ✖ error, ▲ warning, i note.

### Editing on the diagram

- **+** under a task inserts a new task after it. Pick a template from the menu.
- **+ add** inside an empty case or loop adds its first task.
- Drag a task onto the upper or lower half of another task to place it before or after. Drop it on an empty case or
  loop to move it there.
- ✕ on a task deletes it, together with everything inside it.

### Task templates

Every template is valid as created, except for values only you know (addresses, a phone number, a template id).

| Template | Creates |
|---|---|
| Logical check | a `simple` task with the `logical` component: the task fails when the expression is false |
| HTTP call | a `simple` task with the `http` component, with URL, method, headers, body and a success condition |
| Email / SMS notification | a `simple` task with the `notification` component |
| Map resolver | a `simple` task that looks a value up in a nested map |
| Decision | a `decision` with two empty cases |
| For each | a `for` task with a one-task body |
| Repeat until | a `loop` task with a one-task body |
| Manual | a `manual` task |
| Terminate | a `terminate` task |

### The inspector

For a **task** it shows the label, type and description, then the fields that task's type and component read. A
field with a problem is outlined in the colour of its severity. **Raw task JSON** at the bottom edits every field of
the task, including ones the form does not show.

Worth knowing:

- **HTTP request**: choose **URL** (url, method, headers, body) or **Configured route** (the name of a route in the
  service's configuration, which supplies url, method and headers). Headers are required in URL mode; use `{}` for
  none.
- **Retry** is how many times a failed task is tried again. **Retry delay** is in milliseconds and is stored as text.
- **Decision cases**: numbers and `true` / `false` are stored typed, anything else as text. Keep the **default
  branch** empty: the engine fails a run whose default branch holds tasks. Give each expected value its own case.

For the **workflow** it shows:

- **Name**: what the workflow is started, versioned and referenced by.
- **Description**: offered as the version description when you publish. The service stores the version's
  description, not this field.
- **Messenger provider** (required): `sync`, `jms` or `kafka`. It must be switched on in the service.
- **Suppress failure error list**: on unless the definition sets it to `false`.
- **Output parameters** and **Failure output parameters**.
- **Failure workflow** and **Rejection workflow**: another workflow to start when this one fails or is rejected. When
  connected, you pick it from the workflows the service runs.

Other workflow fields (`input`, `webhooks`, `pullContext`, `pushContext`, the failure and rejection input parameters,
`rejectionCondition`) are edited in the **JSON** tab.

## Validation

Problems are checked as you type.

- **✖ Error**: the service would refuse the workflow, or a run would fail. Errors block **Publish**.
- **▲ Warning**: it works, but probably not as you intend. For example, a top-level field the service does not store.
- **i Note**: something to be aware of.

Checks that need the service (failure and rejection workflows) run only while connected. The validation bar says so
when they are skipped.

## Publishing a version

**Publish** opens a dialog for the version details:

- **Version**: the number after the running version is suggested. The service refuses a number that already exists.
- **Schema version**: `1` unless the service has other schemas.
- **Activation date**: when the version may start running.
- **Description**: stored as the description of the version and of the workflow.
- **Active**: leave it on for the version to run. The service has no way to activate a version later, so an
  inactive version is stored but never runs.

A new version starts running when it is active, its activation date has passed, and its number is the highest.

## Stored workflows

Lists the version the service **runs** for each workflow, with its checks, task count, activation date, user and
description. The service does not list other versions.

- **Open** loads the version into the editor.
- **+ New version** does the same and reminds you to publish it as the next version.
- **Deprecate** stops the service from running that version. This cannot be undone. The next lower active version
  then runs; when there is none, the workflow can no longer start and leaves the list.

Every listed version is re-validated with the editor's rules, so problems in workflows published earlier show up
too.

## Executions

### The list

Every run of every workflow, newest first. Filter by status, by workflow name, or by execution id. Click a row to
open the run.

### An execution

- The **header** shows the workflow name and the run's status. **Open definition** loads the definition this run
  used into the editor.
- **Errors**, when the run failed: the message, the task it happened in, and the stack trace.
- **How it ran**: the workflow drawn on the definition the run used, each task coloured by its outcome. Tasks the
  run never reached are dimmed. A task that ran several times (a loop body, a retry) shows `×n`. Click a task to
  inspect its latest execution.
- **Timeline**: every task execution on one time axis, in the order they started.
- **The selected task**: its status and timing, and the task as the engine saved it, with the evaluated fields, the
  output and the error.
- **Inputs and outputs** of the run.

| Colour | Meaning |
|---|---|
| green | completed |
| red | failed |
| purple | rejected, cancelled, skipped or not active |
| blue, dashed | created, started or stopped |

## Settings

- **Service base URL**: leave empty with `npm start`, which proxies to the local service. Otherwise the full URL
  with the context path, e.g. `http://host:8081/workflowmanager`. A direct URL needs CORS enabled on the service.
- **JWT**: sent with every request. It is stored in this browser only.

**Save and test** saves both and tries to list the running workflows.

The **v1 | v2** switch in the top bar changes the visual design. Light or dark follows your system setting.
