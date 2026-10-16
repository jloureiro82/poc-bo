/**
 * Shapes of the configuration payloads accepted by the workflow-manager service
 * (`POST /api/v1/configuration/business-logic/entity-type/workflow`).
 *
 * The engine reads a definition as a `MapObject` (a typed view over a raw map), so every interface carries an index
 * signature and the editor never drops fields it does not know. The create endpoint is stricter than the engine at
 * the top level: it copies only `STORED_WORKFLOW_KEYS` into what it stores (`WorkflowConfigurationApiService.create`).
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
  /** A whole number, or the same as text (`"6"`): `SimpleTaskExecution.getRetry` parses both. */
  retry?: number | string;
  tasks?: TaskConfig[];
  cases?: DecisionCase[];
  default?: { tasks?: TaskConfig[]; [key: string]: unknown };
  list?: unknown;
  inputParameters?: JsonMap;
  failureOutputParameters?: JsonMap;
  failureWorkflowId?: string;
  rejectionWorkflowId?: string;
  [key: string]: unknown;
}

export interface WorkflowDefinition {
  /** The workflow's identity: runs, versions and failure/rejection references all use it. */
  name?: string;
  /** Not stored from here: the service stores the version's description (`configurationDetails.description`). */
  description?: string;
  messengerProvider?: string;
  suppressFailureOutputErrorList?: boolean;
  tasks?: TaskConfig[];
  outputParameters?: JsonMap;
  failureOutputParameters?: JsonMap;
  failureWorkflowId?: string;
  failureInputParameters?: JsonMap;
  rejectionWorkflowId?: string;
  rejectionInputParameters?: JsonMap;
  rejectionCondition?: unknown;
  [key: string]: unknown;
}

/** Request/response body of the workflow create endpoint. */
export interface WorkflowEnvelope {
  workflowConfiguration: WorkflowDefinition;
  configurationDetails: ConfigurationDetails;
}

/** workflow-manager stores one kind of configuration. The type keeps drafts and hand-offs explicit about it. */
export type ConfigKind = 'workflow';

// ---- Vocabulary the backend understands -------------------------------------------------------------------------

/** Top-level keys `WorkflowConfigurationApiService.create` copies into the stored definition. */
export const STORED_WORKFLOW_KEYS = [
  'name',
  'tasks',
  'input',
  'messengerProvider',
  'outputParameters',
  'webhooks',
  'failureWorkflowId',
  'failureInputParameters',
  'rejectionWorkflowId',
  'rejectionInputParameters',
  'rejectionCondition',
  'failureOutputParameters',
  'suppressFailureOutputErrorList',
  'pushContext',
  'pullContext',
] as const;

/** Keys `WorkflowConfigurationDTO` accepts but the create endpoint does not store. */
export const UNSTORED_WORKFLOW_KEYS = ['restartable', 'defaultAction', 'executionType', 'workflowId', 'workflowStatusListenerEnabled'] as const;

/** Keys the service writes itself from `configurationDetails`; whatever the definition holds is replaced. */
export const DERIVED_WORKFLOW_KEYS = ['description', 'version'] as const;

/** Task types that run a named `TaskHandler` component (the worker dispatchers of `EngineConfiguration`). */
export const WORKER_TASK_TYPES = ['simple', 'simpleThreadPool', 'multiStage', 'multiStepThreadPool'] as const;

/**
 * Every task type the editor offers: the dispatchers registered in `EngineConfiguration.taskDispatcher()`, minus
 * `parallel`, which is not used here.
 */
export const TASK_TYPES = [...WORKER_TASK_TYPES, 'logical', 'decision', 'for', 'loop', 'manual', 'terminate'] as const;

/**
 * Types the engine has a class for, but `EngineConfiguration.taskDispatcher()` does not register: a task of one of
 * these types fails with "Unable to execute task".
 */
export const UNREGISTERED_TASK_TYPES = ['async', 'subFlow', 'validate'] as const;

/** `TaskHandler` names `TaskHandlerResolverContext` can resolve: Spring beans, or classes in `core.taskhandler`. */
export const KNOWN_COMPONENTS = ['logical', 'notification', 'mapResolver', 'http', 'bash', 'print', 'randomInt', 'sleep'] as const;

export const NOTIFICATION_TYPES = ['email', 'sms'] as const;

/** The `Messenger` implementations (`canHandle`); each must also be switched on in `workflowengine.messenger.provider`. */
export const MESSENGER_PROVIDERS = ['sync', 'jms', 'kafka'] as const;
