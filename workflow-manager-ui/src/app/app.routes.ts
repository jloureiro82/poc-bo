import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'workflow' },
  {
    path: 'workflow',
    title: 'Workflow · Workflow Configurator',
    loadComponent: () => import('./features/workflow/workflow-editor').then(m => m.WorkflowEditor),
  },
  {
    path: 'executions',
    title: 'Executions · Workflow Configurator',
    loadComponent: () => import('./features/executions/executions-list').then(m => m.ExecutionsList),
  },
  {
    path: 'executions/compare/:a/:b',
    title: 'Compare runs · Workflow Configurator',
    loadComponent: () => import('./features/executions/execution-compare').then(m => m.ExecutionCompare),
  },
  {
    path: 'executions/:workflowId',
    title: 'Execution · Workflow Configurator',
    loadComponent: () => import('./features/executions/execution-detail').then(m => m.ExecutionDetail),
  },
  {
    path: 'library',
    title: 'Stored workflows · Workflow Configurator',
    loadComponent: () => import('./features/library/library').then(m => m.Library),
  },
  {
    path: 'settings',
    title: 'Settings · Workflow Configurator',
    loadComponent: () => import('./features/settings/settings').then(m => m.Settings),
  },
  { path: '**', redirectTo: 'workflow' },
];
