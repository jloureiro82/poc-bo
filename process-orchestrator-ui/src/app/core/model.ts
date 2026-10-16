/**
 * Shapes of the configuration payloads accepted by the process-orchestrator service
 * (`POST /api/v1/workflow/create`, `POST /api/v1/orchestrator/create`).
 *
 * The backend reads these as `MapObject`s (typed views over a raw map), so unknown keys are kept as is:
 * every interface carries an index signature and the editors never drop fields they do not know.
 */

export type JsonMap = Record<string, unknown>;

export interface ConfigurationDetails {
  version?: number;
  schemaVersion?: number;
  active?: boolean;
  deprecated?: boolean;
  description?: string;
  user?: string;
  activationDate?: string;
  entityName?: string;
  entityType?: string;
  [key: string]: unknown;
}

export interface FailurePolicyConfig {
  action?: string;
  /** ISO-8601 duration (e.g. `PT24H`), only with `hold`: how long the flow waits before `onTimeout` applies. */
  holdTimeout?: string;
  /** `fail` (default) or `cancel`, needs `holdTimeout`. */
  onTimeout?: string;
  [key: string]: unknown;
}

export interface CancellationActivityConfig {
  active?: boolean;
  label?: string;
  automaticOnFailure?: boolean;
  staticVariables?: JsonMap;
  [key: string]: unknown;
}

export interface ActivityConfig {
  label?: string;
  workflowLabel?: string;
  previousActivity?: string[];
  type?: string;
  sync?: boolean;
  description?: string;
  condition?: string;
  staticVariables?: JsonMap;
  onFailure?: FailurePolicyConfig;
  cancellationActivity?: CancellationActivityConfig;
  [key: string]: unknown;
}

export interface StepConfig {
  label?: string;
  previousStep?: string[];
  type?: string;
  sync?: boolean;
  activityList?: ActivityConfig[];
  [key: string]: unknown;
}

export interface OrchestratorConfig {
  label?: string;
  staticVariables?: JsonMap;
  stepList?: StepConfig[];
  [key: string]: unknown;
}

export interface DecisionCase {
  key?: unknown;
  tasks?: TaskConfig[];
  [key: string]: unknown;
}

export interface TaskConfig {
  label?: string;
  type?: string;
  component?: string;
  description?: string;
  expression?: string;
  retry?: number;
  tasks?: TaskConfig[];
  cases?: DecisionCase[];
  default?: { tasks?: TaskConfig[]; [key: string]: unknown };
  list?: unknown;
  flowName?: string;
  inputParameters?: JsonMap;
  failureOutputParameters?: JsonMap;
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  label?: string;
  description?: string;
  messengerProvider?: string;
  suppressFailureOutputErrorList?: boolean;
  tasks?: TaskConfig[];
  outputParameters?: JsonMap;
  failureOutputParameters?: JsonMap;
  [key: string]: unknown;
}

/** Request/response body of the orchestrator configuration endpoints. */
export interface OrchestratorEnvelope {
  orchestratorConfiguration: OrchestratorConfig;
  configurationDetails: ConfigurationDetails;
}

/** Request/response body of the workflow configuration endpoints. */
export interface WorkflowEnvelope {
  workflowConfiguration: WorkflowDefinition;
  configurationDetails: ConfigurationDetails;
}

export type ConfigKind = 'workflow' | 'orchestrator';

// ---- Vocabulary the backend understands -------------------------------------------------------------------------

/** `ExecutionKeys.STEP_TYPE_*`. Anything other than `automatic` is treated as manual. */
export const STEP_TYPES = ['manual', 'automatic'] as const;

/** `ExecutionKeys.ACTIVITY_TYPE_*` usable in a definition. Anything other than `automatic` is treated as manual. */
export const ACTIVITY_TYPES = ['manual', 'automatic'] as const;

/** `FailurePolicyConfig.ACTIONS`. */
export const FAILURE_ACTIONS = ['fail', 'hold', 'cancel'] as const;

/** `FailurePolicyConfig.TIMEOUT_ACTIONS`: what happens to a flow whose hold expired. */
export const TIMEOUT_ACTIONS = ['fail', 'cancel'] as const;

/** Task types that run a named `TaskHandler` component (workflow-core worker dispatchers). */
export const WORKER_TASK_TYPES = ['simple', 'simpleThreadPool', 'async', 'multiStage', 'multiStepThreadPool'] as const;

/** Every task type the editor offers (workflow-core also has `parallel`, which is not used here). */
export const TASK_TYPES = [
  ...WORKER_TASK_TYPES,
  'logical',
  'decision',
  'for',
  'manual',
  'subFlow',
  'terminate',
  'validate',
] as const;

/** `TaskHandler` beans known to exist: workflow-core's own plus this service's `logical`/`notification`/`mapResolver`. */
export const KNOWN_COMPONENTS = ['logical', 'notification', 'mapResolver', 'http', 'bash', 'print', 'randomInt', 'sleep'] as const;

export const NOTIFICATION_TYPES = ['email', 'sms'] as const;
