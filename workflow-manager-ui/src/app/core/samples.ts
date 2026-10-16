import { WorkflowDefinition } from './model';

/** Starter documents, modelled on the Postman collection shipped with the service. */

export function newWorkflow(): WorkflowDefinition {
  return {
    name: 'myWorkflow',
    description: '',
    messengerProvider: 'sync',
    tasks: [{ label: 'check', type: 'simple', component: 'logical', expression: '${true}' }],
    outputParameters: { code: '0000', message: 'Success' },
    failureOutputParameters: { code: '-1', message: 'Failure' },
  };
}

export function sampleWorkflow(): WorkflowDefinition {
  return {
    name: 'routeRequest',
    description: 'Checks the request, then routes it by channel',
    messengerProvider: 'sync',
    tasks: [
      {
        label: 'checkEntryParameters',
        type: 'simple',
        component: 'logical',
        expression: "${workflow['channel'] != null}",
        failureOutputParameters: { code: '-1', causeMessage: 'Missing parameters' },
      },
      {
        label: 'route',
        type: 'decision',
        expression: "${workflow['channel']}",
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
                emailTo: ["${workflow['email']}"],
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
                phoneNumber: "${workflow['phone']}",
              },
            ],
          },
        ],
      },
      {
        label: 'registerContact',
        type: 'simple',
        component: 'http',
        retry: 3,
        retryDelay: '1000',
        successCondition: '${statusCode == 200}',
        inputParameters: {
          url: 'https://example.org/api/contacts',
          httpMethod: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { channel: "${workflow['channel']}" },
        },
      },
    ],
    outputParameters: { code: '0000', message: 'Success' },
    failureOutputParameters: { code: '-1', message: 'Failure' },
  };
}
