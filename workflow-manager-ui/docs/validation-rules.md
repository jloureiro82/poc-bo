# Validation rules

Every check the Workflow Configurator runs, the reason behind it, and where it comes from.

The rules are derived from the **workflow-manager** source (`../workflow-manager`, package
`com.multicert.workflowmanager`). Some rules are **team conventions**, marked ★. They are stricter than what the
engine itself enforces, and were carried over from the Flow Configurator for process-orchestrator.

Severity: **✖ error** (blocks Publish) · **▲ warning** · **i note**.

When a backend rule changes, update the validator (`src/app/core/workflow-validator.ts`) **and** this page.

---

## The workflow

### What the create endpoint needs and stores (`WorkflowConfigurationApiService.create`)

| Rule | Why | Sev. |
|---|---|---|
| `name` is required. The message hints when only `label` was given. | the service saves, versions and starts a workflow by name | ✖ |
| `messengerProvider` is required and one of `sync`, `jms`, `kafka` | `MessengerHandler.send` throws "Not Found Messenger Provider" for anything else, a missing value included | ✖ |
| `tasks` is a list with at least one task | | ✖ |
| `outputParameters`, `failureOutputParameters`, `failureInputParameters`, `rejectionInputParameters`, `pullContext`, `pushContext` are objects | values the engine casts to maps | ✖ |
| `input`, `webhooks` are lists | | ✖ |
| `suppressFailureOutputErrorList` is a boolean | absent means **true**: the endpoint stores `true` when it is not given | ✖ |
| A top-level field outside the stored set is **not stored** | the endpoint copies only: `name`, `tasks`, `input`, `messengerProvider`, `outputParameters`, `webhooks`, `failureWorkflowId`, `failureInputParameters`, `rejectionWorkflowId`, `rejectionInputParameters`, `rejectionCondition`, `failureOutputParameters`, `suppressFailureOutputErrorList`, `pushContext`, `pullContext` | ▲ |
| `restartable`, `defaultAction`, `executionType`, `workflowId`, `workflowStatusListenerEnabled` have no effect | `WorkflowConfigurationDTO` accepts them, the endpoint does not store them | i |

`description` and `version` are not reported: the service writes both from the version details you give when
publishing, whatever the definition holds.

### Contexts (`WorkflowService`)

| Rule | Why | Sev. |
|---|---|---|
| `pullContext` needs `stackId` | `internalCreate` loads the context with that key when the run is created | ✖ |
| `pushContext` without `stackId` | `complete` then skips saving the context | ▲ |
| `pushContext.stackParameters` is an object (or an expression) | it is cast to a map | ✖ |

### Failure and rejection workflows (`WorkflowFailure`)

`failureWorkflowId` and `rejectionWorkflowId`, on the workflow or on a task, name the workflow to start when the run
fails or is rejected.

| Rule | Sev. |
|---|---|
| The value is a non-blank name | ✖ |
| When connected: the service runs a workflow with that name. A workflow with no active version counts as missing, because the service lists only what it runs. | ✖ |

---

## Every task

| Rule | Why | Sev. |
|---|---|---|
| `label` is required | | ✖ |
| Labels are unique across the workflow | the run keeps each task's result under its label (`WorkflowExecution.addExecution`), so one overwrites the other | ▲ |
| `type` is required and known: `simple`, `simpleThreadPool`, `multiStage`, `multiStepThreadPool`, `logical`, `decision`, `for`, `loop`, `manual`, `terminate` | the dispatcher is chosen by type (`terminate` is matched case-insensitively) | ✖ |
| `async`, `subFlow`, `validate` are rejected | their classes exist, but `EngineConfiguration.taskDispatcher()` does not register them, so `TaskDispatcherHandle` throws "Unable to execute task" | ✖ |
| `parallel` is **not used** ★ | team rule (the engine does register it) | ✖ |
| `retry` is a whole number ≥ 0, as a number or as text (`"6"`) | `SimpleTaskExecution.getRetry` parses both | ✖ |
| `retryDelay`, `retryDelayMillis` are whole numbers **written as text** (`"1000"`) | `getRetryDelay` casts the value to `String` before parsing, so a bare number fails. Only the jms and kafka messengers wait the delay. | ✖ |
| Logical tasks do not set `retry` ★ | re-evaluating the same expression gives the same result | ▲ |
| `active` is a boolean; `active: false` means the engine skips the task | `TaskDispatcherHandle.dispatch` | ✖ / i |
| `tasks` on a type that ignores it | | ▲ |

### By type

| Type | Rule | Sev. |
|---|---|---|
| worker types (`simple`, …) | `component` is required. Known components: `logical`, `notification`, `mapResolver`, `http`, `bash`, `print`, `randomInt`, `sleep`. Others are warned (▲) in case a custom `TaskHandler` exists. | ✖ |
| worker types | no `component` but a `name`: accepted, because `TaskHandlerResolverContext` falls back to the task's name | i |
| `logical` | `expression` is required | ✖ |
| `decision` | `expression` is required; `cases` is a non-empty list of `{ key, tasks }` | ✖ |
| `decision` | each case has a `key` (✖: `DecisionTaskDispatcher.resolveCase` calls `key.equals`); keys are unique (▲, only the first match runs); a case with no tasks (▲) | |
| `decision` | `default` is optional; when present, it is an object | ✖ |
| `decision` | `default` must not hold tasks. `DecisionTaskDispatcher` reads it as `{ tasks }` and starts the first task; when that task completes, `DecisionTaskCompletionHandler.resolveCase` reads `default` as a list and the run fails with a cast error. Confirmed on a running service. Give every expected value its own case. | ✖ |
| `for` | `list` and a non-empty `tasks` (the loop body) | ✖ |
| `loop` | `expression` and a non-empty `tasks`. The body runs, then again **until** the expression is true (`LoopTaskCompletionHandler`). | ✖ |

### By component

| Component | Rule | Source | Sev. |
|---|---|---|---|
| `logical` | `expression` is required | `LogicalTask` | ✖ |
| `http` | `inputParameters` is an object with `url` (direct mode). `httpMethod` ∈ `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (default POST). | `Http.handle` | ✖ |
| `http` | `inputParameters.headers` is **required** in direct mode (use `{}` for none): the handler passes it to `HttpHeaders.setAll`, which fails on a missing map. Empty headers get `Content-Type: application/json`. | `Http.handle` | ✖ |
| `http` | **Route mode**: `inputParameters.endpoint` is a route **name** from `workflowengine.endpoints.routes`. `url`, `httpMethod` and `headers` are then ignored (▲). | `Http.handle` | ✖ / ▲ |
| `http` | `successCondition` is **one** `${…}` with nothing around it, e.g. `${statusCode == 200}`. It is evaluated on `{ statusCode, body` or `rawBody, headers }`. Any other text (plain `true`, `statusCode == 200`, `${a} ${b}`, an empty string) is a template that yields a string, which counts as false, so the task always fails. | `Http.successConditionMethod` | ✖ |
| `http` | a `successCondition` that is not text is ignored, but its presence still turns 4xx/5xx into results: every response then counts as a success | `Http.handle` | ▲ |
| `http` | `errorHandler` is a boolean (default true). `false` stops 4xx/5xx from being errors: without a `successCondition` they count as success (▲). With one, it judges every response anyway, so `errorHandler` has no effect (i). | `Http.handle` | ✖ / ▲ / i |
| `http` | `instantFailureCondition` is a `${…}` expression or a boolean (✖). It is checked on the same response when the call fails (error status, timeout, false `successCondition`); true fails the task without the remaining retries. Text that is not one `${…}` never applies (▲); without `retry` there is nothing to skip (i). | `SimpleWorker.getFailureCondition`, `TaskExecutionErrorHandler` | ✖ / ▲ / i |
| `notification` | `notificationType` ∈ `email`, `sms`; `template` is required | `NotificationTask` | ✖ |
| `notification` (email) | `emailTo` is a non-empty list (✖); empty `emailFrom` or `subject` (▲) | `NotificationTask` | |
| `notification` (sms) | `phoneNumber` is required | `NotificationTask` | ✖ |
| `notification` | `content` and `protectedContent` are objects | | ✖ |
| `mapResolver` | `keys` is required, and every key name contains a number (`key1`, `key2`, …), because keys are sorted by that number | `MapResolver.handle` | ✖ |
| `mapResolver` | `map` is a nested object, **or** a `${…}` expression that yields one at run time | `MapResolver.handle` | ✖ |
| `mapResolver` (inline map) | no more keys than the map has levels; every final value is a string | `MapResolver.handle` | ✖ |
| `mapResolver` (inline map) | no `DEFAULT` at the first level: an unmatched key fails the task | `MapResolver.resolveMap` | i |

`successCondition`, `errorHandler`, `instantFailureCondition` and `rawRequest` belong on the **task**, not in
`inputParameters`. That is where `Http.handle` and `SimpleWorker` read them. `retryDelayMillis` and
`retryDelayFactor` are read by `SimpleTaskExecution` but used nowhere, so the editor does not offer them.

---

## SpEL expressions

Implemented in `src/app/core/spel.ts`. Applies to **every string value that contains `${`**, anywhere in a task or
workflow.

The service evaluates these strings with Spring's `SpelExpressionParser` and `TemplateParserContext("${", "}")`
(`SpelExpressionEngine`). Text outside `${…}` is literal. The end of each expression is found by matching brackets
and skipping string literals. The checker mirrors this. It parses each expression with a grammar that follows
Spring's `InternalSpelExpressionParser`.

It reports (✖), with the field path and a snippet:

- an unclosed `${`, `(`, `[`, `{` or string literal, and a bracket closed by the wrong kind;
- an empty `${}`;
- missing operands (`a == `), two values with no operator between them (`a b`), a ternary without `:`;
- broken `T(…)`, `new …`, argument lists, inline lists and maps, indexers `[…]`;
- characters SpEL does not allow (`~`, …).

It checks **syntax only**. Unknown properties, methods, beans or types are not detected; they fail at run time.

In a workflow, the run's input is available as `workflow` (`${workflow.email}`), and each finished task as
`execution.<label>` (`${execution.login.output.body.accessToken}`).

---

## Known gaps

These checks are not implemented yet, but would catch real mistakes:

- **References to task results that run later.** For example `${execution.X.output…}` where task `X` runs after the
  task using it, or sits inside a case that has not run.
- **The run-time meaning of a value**: wrong property names, types, or what an expression returns.
- **The JSON schema stored in the service** (`EntitySchema`, per `schemaVersion`). The create endpoint validates the
  request against it; the app does not read it.
