import { OrchestratorConfig, WorkflowDefinition } from './model';

/** Starter documents, modelled on the Postman collection shipped with the service. */

export function newOrchestrator(): OrchestratorConfig {
  return {
    label: 'myFlow',
    staticVariables: {},
    stepList: [
      {
        label: 'intake',
        activityList: [{ label: 'submit', workflowLabel: 'myWorkflow', staticVariables: {} }],
      },
    ],
  };
}

export function sampleOrchestrator(): OrchestratorConfig {
  return {
    label: 'approvalFlow',
    staticVariables: { serviceRequestArea: 'Cliente' },
    stepList: [
      {
        label: 'intake',
        activityList: [
          { label: 'submit', workflowLabel: 'logicalSuccess', staticVariables: { serviceRequestState: 'Abierto' } },
          {
            label: 'approve',
            previousActivity: ['submit'],
            type: 'manual',
            sync: true,
            workflowLabel: 'logicalSuccess',
            onFailure: { action: 'hold' },
          },
        ],
      },
      {
        label: 'process',
        previousStep: ['intake'],
        type: 'automatic',
        sync: true,
        activityList: [
          {
            label: 'handle',
            workflowLabel: 'logicalSuccess',
            onFailure: { action: 'cancel' },
            cancellationActivity: { active: true, label: 'undoHandle' },
          },
          { label: 'notify', previousActivity: ['handle'], type: 'automatic', sync: true, workflowLabel: 'logicalSuccess' },
        ],
      },
    ],
  };
}

export function newWorkflow(): WorkflowDefinition {
  return {
    label: 'myWorkflow',
    description: '',
    messengerProvider: 'sync',
    tasks: [{ label: 'check', type: 'simple', component: 'logical', expression: '${true}' }],
    outputParameters: { code: '0000', message: 'Success' },
    failureOutputParameters: { code: '-1', message: 'Failure' },
  };
}

export function sampleWorkflow(): WorkflowDefinition {
  return {
    label: 'routeRequest',
    description: 'Checks the request, then routes it by channel',
    messengerProvider: 'sync',
    tasks: [
      {
        label: 'checkEntryParameters',
        type: 'simple',
        component: 'logical',
        expression: "${workflow['requestContext'] != null}",
        failureOutputParameters: { code: '-1', causeMessage: 'Missing parameters' },
      },
      {
        label: 'route',
        type: 'decision',
        expression: "${workflow['requestContext']['channel']}",
        cases: [
          {
            key: 'email',
            tasks: [
              {
                label: 'sendEmail',
                type: 'simple',
                component: 'notification',
                notificationType: 'email',
                template: 'welcome',
                emailFrom: 'no-reply@example.org',
                emailTo: ["${workflow['requestContext']['email']}"],
                subject: 'Welcome',
              },
            ],
          },
          {
            key: 'sms',
            tasks: [
              {
                label: 'sendSms',
                type: 'simple',
                component: 'notification',
                notificationType: 'sms',
                template: 'welcome',
                phoneNumber: "${workflow['requestContext']['phone']}",
              },
            ],
          },
        ],
        default: { tasks: [{ label: 'logUnknownChannel', type: 'simple', component: 'print' }] },
      },
      { label: 'checkA', type: 'simple', component: 'logical', expression: '${true}' },
      { label: 'checkB', type: 'simple', component: 'logical', expression: '${true}' },
    ],
    outputParameters: { code: '0000', message: 'Success' },
    failureOutputParameters: { code: '-1', message: 'Failure' },
  };
}
