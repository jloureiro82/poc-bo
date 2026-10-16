/**
 * Copy shared by both overview pages, so the two versions make the same claims. Everything here must stay true to
 * the app; numbers on the pages are counted from real data (e.g. TASK_TEMPLATES), never typed in.
 */

export const SECTIONS = [
  { id: 'features', label: 'Features' },
  { id: 'flow', label: 'How it works' },
  { id: 'templates', label: 'Templates' },
] as const;

export const STEPS = [
  { title: 'Draft', text: 'Start from a sample or a blank document, and add tasks from templates.' },
  { title: 'Validate', text: 'Errors and warnings update as you type, and clicking one takes you to its field.' },
  { title: 'Publish', text: 'Create a new version in the service. It is refused while any error remains.' },
  { title: 'Monitor', text: 'Follow each execution on its diagram and timeline, then open the configuration it ran.' },
];

export type FeatureIcon = 'diagram' | 'check' | 'versions' | 'replay' | 'json';

export const FEATURES: { icon: FeatureIcon; title: string; text: string }[] = [
  {
    icon: 'diagram',
    title: 'Two editors, one document',
    text:
      'Orchestrators are steps and activities that you link by dragging. In workflows, decisions fan out into cases ' +
      'and loops wrap their tasks. Move tasks between branches with drag and drop or the keyboard.',
  },
  {
    icon: 'check',
    title: 'Validation that reads the engine',
    text:
      "The rules come from the orchestrator's own source. Each one names the field, and the inspector highlights that field.",
  },
  {
    icon: 'versions',
    title: 'Publish without guessing versions',
    text: 'The next free version number is suggested for you. Activate, deactivate or deprecate versions from the library.',
  },
  {
    icon: 'replay',
    title: 'Replay any execution',
    text:
      'See every activity run on one time axis, including retries and cancellations, and failures colour the diagram ' +
      'where they happened.',
  },
  {
    icon: 'json',
    title: 'The JSON stays yours',
    text:
      "Import, export or copy it. Edit it as raw text, where errors point to a line and column. Keys the editor doesn't know are kept.",
  },
];
