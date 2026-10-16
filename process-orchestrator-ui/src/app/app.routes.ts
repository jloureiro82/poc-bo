import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'orchestrator' },
  // the old address of the overview page, from when there were two designs
  { path: 'overview/v2', redirectTo: 'overview' },
  {
    path: 'overview',
    title: 'Flow Configurator',
    loadComponent: () => import('./features/overview/overview').then(m => m.Overview),
  },
  {
    path: 'orchestrator',
    title: 'Orchestrator · Flow Configurator',
    loadComponent: () => import('./features/orchestrator/orchestrator-editor').then(m => m.OrchestratorEditor),
  },
  {
    path: 'workflow',
    title: 'Workflow · Flow Configurator',
    loadComponent: () => import('./features/workflow/workflow-editor').then(m => m.WorkflowEditor),
  },
  {
    path: 'executions',
    title: 'Executions · Flow Configurator',
    loadComponent: () => import('./features/executions/executions-list').then(m => m.ExecutionsList),
  },
  {
    path: 'executions/compare/:a/:b',
    title: 'Compare runs · Flow Configurator',
    loadComponent: () => import('./features/executions/execution-compare').then(m => m.ExecutionCompare),
  },
  {
    path: 'executions/:orchestratorId',
    title: 'Execution · Flow Configurator',
    loadComponent: () => import('./features/executions/execution-detail').then(m => m.ExecutionDetail),
  },
  {
    path: 'library',
    title: 'Stored configurations · Flow Configurator',
    loadComponent: () => import('./features/library/library').then(m => m.Library),
  },
  {
    path: 'settings',
    title: 'Settings · Flow Configurator',
    loadComponent: () => import('./features/settings/settings').then(m => m.Settings),
  },
  { path: '**', redirectTo: 'orchestrator' },
];
