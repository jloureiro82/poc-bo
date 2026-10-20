# Validation rules

Every check the Flow Configurator runs, the reason behind it, and where it comes from.

Most rules are derived from the **process-orchestrator** source and the **workflow-core** library (0.1.4). For
workflow-core, the source was read from the jar with `javap`, because the sources jar is not available. Some rules
are **team conventions**, marked ★. They are stricter than what the engine itself enforces.

Severity: **✖ error** (blocks Publish) · **▲ warning** · **i note**.

When a backend rule changes, update the validators (`src/app/core/*-validator.ts`) **and** this page.

---

## Orchestrator configuration

Implemented in `src/app/core/orchestrator-validator.ts`.

### Mirrors the create endpoint (`OrchestratorConfigValidator`)

| Rule | Sev. |
|---|---|
| `label` is required and non-blank | ✖ |
| `stepList` has at least one step | ✖ |
| `onFailure` is an object | ✖ |
| `onFailure.action` ∈ `fail`, `hold`, `cancel` (`FailurePolicyConfig.ACTIONS`) | ✖ |
| `onFailure.action: cancel` needs an **active** `cancellationActivity` with a `label` | ✖ |
| `onFailure.holdTimeout` only with `action: hold` | ✖ |
| `onFailure.holdTimeout` is a positive ISO-8601 duration (`Duration.parse`: days, hours, minutes, seconds, e.g. `PT24H`) | ✖ |
| `onFailure.onTimeout` needs a `holdTimeout` and is one of `fail`, `cancel` (`FailurePolicyConfig.TIMEOUT_ACTIONS`) | ✖ |
| `onFailure.onTimeout: cancel` needs an **active** `cancellationActivity` with a `label` | ✖ |

### Structure the engine depends on

| Rule | Why | Sev. |
|---|---|---|
| Every step and activity has a non-blank, unique label (activities: unique within their step) | the engine finds them by label | ✖ |
| Exactly one entry step (no `previousStep`) | `FlowExecutionService` starts at the **first** step without `previousStep`. Extra entry steps are never started (▲). With none, the flow cannot start (✖). | ✖ / ▲ |
| Exactly one entry activity per step | same logic per step, for `previousActivity` | ✖ / ▲ |
| `previousStep` / `previousActivity` is a list of existing labels, not empty, not self, no cycles | links are resolved with `contains(label)` | ✖ |
| Every step and activity is reachable from the entry | otherwise it never runs | ▲ |
| A step has at least one activity | the flow stops at an empty step | ✖ |
| `workflowLabel` is required | it is the workflow the activity runs | ✖ |
| `type` ∈ `manual`, `automatic` | anything else is treated as manual | ▲ |
| `sync` and the `cancellationActivity` flags are booleans; `staticVariables` are objects | values the engine casts | ✖ |
| `automaticOnFailure` without `active` | has no effect | ▲ |
| `onFailure` other than `cancel` together with `automaticOnFailure` | the policy wins, so the cancellation does not run automatically | i |

### Automatic vs manual chaining ★

`AutomaticStepController` and `AutomaticActivityController` start the **first** automatic successor of a completed
node, in definition order, and return. The team rule built on that:

| Rule | Sev. |
|---|---|
| An **automatic** step or activity has **exactly one** predecessor (1 to 1) | ✖ |
| An automatic node must be the **only** successor of its predecessor. No other option, manual or automatic, may follow the same node. | ✖ |
| **Manual** steps and activities may have several predecessors and several (manual) successors | — |

### References (when connected)

| Rule | Sev. |
|---|---|
| `workflowLabel` and `cancellationActivity.label` name a stored workflow | ✖ |
| … that has an active version | ▲ |

### Expressions

Every `${…}` in an activity (for example `condition`, or values in `staticVariables`) is checked as SpEL. See
[SpEL](#spel-expressions).

---

## Workflow definition

Implemented in `src/app/core/workflow-validator.ts`.

### Mirrors the create endpoint (`WorkflowDefinitionValidator`)

| Rule | Sev. |
|---|---|
| `label` is required. The message hints when only `name` was given. | ✖ |
| `tasks` has at least one task | ✖ |

### Every task

| Rule | Why | Sev. |
|---|---|---|
| `label` is required | | ✖ |
| Labels are unique across the workflow | executions are hard to tell apart otherwise | ▲ |
| `type` is required and known: `simple`, `simpleThreadPool`, `async`, `multiStage`, `multiStepThreadPool`, `logical`, `decision`, `for`, `manual`, `subFlow`, `terminate`, `validate` | the dispatcher is chosen by type (`subFlow` and `terminate` are matched case-insensitively) | ✖ |
| `parallel` is **not used** ★ | team rule | ✖ |
| `retry` is a whole number ≥ 0, as a number or as text (`"6"`) | workflow-core `SimpleTaskExecution.getRetry` parses both | ✖ |
| `retryDelay`, `retryDelayMillis` are whole numbers **written as text** (`"1000"`) | `getRetryDelay` casts the value to `String` before parsing, so a bare number fails. Only the jms and kafka messengers wait the delay. | ✖ |
| Logical tasks do not set `retry` ★ | re-evaluating the same expression gives the same result | ▲ |
| `tasks` on a type that ignores it | | ▲ |

### By type

| Type | Rule | Sev. |
|---|---|---|
| worker types (`simple`, …) | `component` is required. Known components: `logical`, `notification`, `mapResolver`, `http`, `bash`, `print`, `randomInt`, `sleep`. Others are warned (▲) in case a custom `TaskHandler` exists. | ✖ |
| `logical`, `validate` | `expression` is required | ✖ |
| `decision` | `expression` is required; `cases` is a non-empty list of `{ key, tasks }` | ✖ |
| `decision` | each case has a `key` (✖); keys are unique (▲, only the first match runs); a case with no tasks (▲) | |
| `decision` | `default` is optional; when present, it is `{ tasks: [...] }` | ✖ |
| `for` | `list` and a non-empty `tasks` (the loop body) | ✖ |
| `subFlow` | `flowName` is required (✖); when connected, it names a stored workflow (✖) with an active version (▲) | |

### By component

| Component | Rule | Source | Sev. |
|---|---|---|---|
| `logical` | `expression` is required | `LogicalTask` | ✖ |
| `http` | `inputParameters` is an object with `url` (direct mode). `httpMethod` ∈ `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (default POST; `HttpMethod.valueOf` throws on others). `headers` is an object. | workflow-core `Http.handle` | ✖ |
| `http` | **Route mode**: `inputParameters.endpoint` is a route **name** from `workflowengine.endpoints.routes`. `url`, `httpMethod` and `headers` are then ignored (▲). | `Http.handle` | ✖ / ▲ |
| `http` | `successCondition` is **one** `${…}` with nothing around it, e.g. `${statusCode == 200}`. It is evaluated on `{ statusCode, body` or `rawBody, headers }`. Any other text (plain `true`, `statusCode == 200`, `${a} ${b}`, an empty string) is a template that yields a string, which counts as false, so the task always fails. | `Http.successConditionMethod` | ✖ |
| `http` | a `successCondition` that is not text is ignored, but its presence still turns 4xx/5xx into results: every response then counts as a success | `Http.handle` | ▲ |
| `http` | `errorHandler` is a boolean (default true). `false` stops 4xx/5xx from being errors: without a `successCondition` they count as success (▲). With one, it judges every response anyway, so `errorHandler` has no effect (i). | `Http.handle` | ✖ / ▲ / i |
| `http` | `instantFailureCondition` is a `${…}` expression or a boolean (✖). It is checked on the same response when the call fails (error status, timeout, false `successCondition`); true fails the task without the remaining retries. Text that is not one `${…}` never applies (▲); without `retry` there is nothing to skip (i). | `SimpleWorker.getFailureCondition`, `TaskExecutionErrorHandler` | ✖ / ▲ / i |
| `notification` | `notificationType` ∈ `email`, `sms`; `template` is required | `NotificationTask` | ✖ |
| `notification` (email) | `emailTo` is a non-empty list (✖); empty `emailFrom` or `subject` (▲) | `NotificationTask.sendMail` | |
| `notification` (sms) | `phoneNumber` is required | `NotificationTask.sendSMS` | ✖ |
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

Implemented in `src/app/core/spel.ts`. Applies to **every string value that contains `${`**, anywhere in a task,
workflow or activity.

The service evaluates these strings with Spring's `SpelExpressionParser` and `TemplateParserContext("${", "}")`
(`commons-spel-engine`). Text outside `${…}` is literal. The end of each expression is found by matching brackets
and skipping string literals. The checker mirrors this. It parses each expression with a grammar that follows
Spring's `InternalSpelExpressionParser`.

It reports (✖), with the field path and a snippet:

- an unclosed `${`, `(`, `[`, `{` or string literal, and a bracket closed by the wrong kind;
- an empty `${}`;
- missing operands (`a == `), two values with no operator between them (`a b`), a ternary without `:`;
- broken `T(…)`, `new …`, argument lists, inline lists and maps, indexers `[…]`;
- characters SpEL does not allow (`~`, …).

It checks **syntax only**. Unknown properties, methods, beans or types are not detected; they fail at run time.
Before release it was run over all 191 expressions stored in the dev service, and reported nothing.

---

## Known gaps

These checks are not implemented yet, but would catch real mistakes:

- **References to task results that run later.** For example `${subexecution.X.output…}` where task `X` runs after
  the task using it, or sits inside a case that has not run. This was found by hand in `accountCreate`.
- **The run-time meaning of a value**: wrong property names, types, or what an expression returns.
