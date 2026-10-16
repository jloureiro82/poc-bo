import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { AnyEnvelope, toStored } from '../../core/config-api.service';
import { MAX_SAVED_DRAFTS, SavedDraft, forgetDraft, keepDraft, listSavedDrafts, loadTabs, saveTabs, takeQueuedOpen, unwrapImported } from '../../core/drafts';
import { TabsState, activeTab, closeTab, isEdited, markPublished, openTab, selectTab, updateActive } from '../../core/editor-tabs';
import { sameValue } from '../../core/diff';
import { History } from '../../core/history';
import { labelsIn, parseTasks, prepareForPaste } from '../../core/task-clipboard';
import { Severity, fieldSeverity, severityByNode } from '../../core/issues';
import { JsonPath, getAt, isObject, parsePath, pathToString, setAt } from '../../core/json-path';
import { KNOWN_COMPONENTS, NOTIFICATION_TYPES, TASK_TYPES, TaskConfig, WORKER_TASK_TYPES, WorkflowDefinition } from '../../core/model';
import { newWorkflow, sampleWorkflow } from '../../core/samples';
import { HTTP_METHODS, TASK_TEMPLATES, TaskTemplate, httpFields, isLogicalTask } from '../../core/task-templates';
import { WorkflowCatalogService } from '../../core/workflow-catalog.service';
import { PanelSizesService } from '../../core/panel-sizes.service';
import { findTaskPath, moveTask as moveTaskTo } from '../../core/task-moves';
import { caseKeyText, childTaskLists, validateWorkflow } from '../../core/workflow-validator';
import { AutoGrow } from '../../shared/auto-grow';
import { DiagramViewport } from '../../shared/diagram-viewport';
import { AddOption, EditorTabs, TabLabel } from '../../shared/editor-tabs';
import { ResizeHandle } from '../../shared/resize-handle';
import { IssuesPanel } from '../../shared/issues-panel';
import { KeyActivate } from '../../shared/key-activate';
import { JsonDocument } from '../../shared/json-document';
import { JsonField } from '../../shared/json-field';
import { download } from '../../shared/download';
import { exportDiagram } from '../../shared/diagram-export';
import { PublishDialog } from '../../shared/publish-dialog';
import { ShortcutsDialog } from '../../shared/shortcuts-dialog';
import { TaskTemplateMenu } from '../../shared/task-template-menu';
import { WorkflowSelect } from '../../shared/workflow-select';
import { FlowItem, TaskFlow, TaskInsert } from './task-flow';
import { TaskDragService } from './task-drag.service';

interface OutlineRow {
  kind: 'task' | 'list';
  depth: number;
  /** For a task: its path. For a list: the path of the array it adds to. */
  path: JsonPath;
  key: string;
  title: string;
  type?: string;
  component?: string;
  first?: boolean;
  last?: boolean;
}

/** Documents not worth keeping in the closed-tabs list: the starters, untouched. */
const PRISTINE = [newWorkflow(), sampleWorkflow()];

/** The tab bar's "+" menu. */
const ADD_OPTIONS: AddOption[] = [
  { id: 'blank', label: 'Blank workflow', hint: 'One task to start from' },
  { id: 'sample', label: 'Sample workflow', hint: 'A decision, notifications and checks' },
  { id: 'import', label: 'Import…', hint: 'A .json file: a definition or a full create request' },
];

@Component({
  selector: 'app-workflow-editor',
  imports: [
    DatePipe,
    TaskFlow,
    AutoGrow,
    KeyActivate,
    DiagramViewport,
    EditorTabs,
    ResizeHandle,
    IssuesPanel,
    JsonField,
    JsonDocument,
    PublishDialog,
    ShortcutsDialog,
    TaskTemplateMenu,
    WorkflowSelect,
  ],
  templateUrl: './workflow-editor.html',
  providers: [TaskDragService],
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(document:copy)': 'onCopy($event, false)',
    '(document:cut)': 'onCopy($event, true)',
    '(document:paste)': 'onPaste($event)',
    '(document:pointerdown)': 'onDocumentPointer($event)',
  },
})
export class WorkflowEditor {
  protected readonly catalog = inject(WorkflowCatalogService);
  protected readonly panels = inject(PanelSizesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly diagram = viewChild<ElementRef<HTMLElement>>('diagram');
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  /**
   * The open tabs, one document each. `config` is the shown tab's document; commit() and undo / redo write it back
   * into its tab. Each tab has its own undo history and selection, kept here by tab id (not stored).
   */
  protected readonly tabs = signal<TabsState<WorkflowDefinition>>(loadTabs('workflow', sampleWorkflow));
  /** Each tab's title and state. The shown tab's errors come from `issues`; the others are validated here. */
  protected readonly tabLabels = computed<TabLabel[]>(() =>
    this.tabs().tabs.map(t => {
      const shown = t.id === this.tabs().active;
      const body = shown ? this.config() : t.body;
      const errors = shown
        ? this.errorCount() > 0
        : validateWorkflow(body, { workflows: this.catalog.catalog() }).some(i => i.severity === 'error');
      return { id: t.id, title: body.label || '(no label)', errors, edited: isEdited({ ...t, body }) };
    }),
  );
  protected readonly addOptions = ADD_OPTIONS;
  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');
  private readonly histories = new Map<string, History<WorkflowDefinition>>();
  private readonly selections = new Map<string, string>();

  /** Undo / redo of the shown tab. `historyTick` changes on every step so the buttons update. */
  private get history(): History<WorkflowDefinition> {
    const id = this.tabs().active;
    let history = this.histories.get(id);
    if (!history) {
      history = new History<WorkflowDefinition>();
      this.histories.set(id, history);
    }
    return history;
  }
  private readonly historyTick = signal(0);
  protected readonly canUndo = computed(() => (this.historyTick(), this.tabs(), this.history.canUndo));
  protected readonly canRedo = computed(() => (this.historyTick(), this.tabs(), this.history.canRedo));

  protected readonly showShortcuts = signal(false);
  protected readonly maxDrafts = MAX_SAVED_DRAFTS;
  /** Closed tabs, newest first (stored as the saved drafts list). */
  protected readonly savedDrafts = signal<SavedDraft[]>(listSavedDrafts('workflow'));
  /** Position of the open closed-tabs menu (fixed, so no panel clips it), or `null`. */
  protected readonly draftsMenu = signal<{ top: number; right: number } | null>(null);

  /** Find box: matching task paths, in outline order. */
  protected readonly query = signal('');
  protected readonly matchRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q
      ? this.outline().filter(r => r.kind === 'task' && [r.title, r.type, r.component].some(v => v?.toLowerCase().includes(q)))
      : [];
  });
  protected readonly matchKeys = computed(() => (this.query().trim() ? new Set(this.matchRows().map(r => r.key)) : null));
  protected readonly matchIndex = computed(() => this.matchRows().findIndex(r => r.key === this.selectedPath()));

  /** Outline drag and drop: the task being dragged and the row it would drop on. */
  protected readonly dragKey = signal<string | null>(null);
  protected readonly dropKey = signal<string | null>(null);
  private dragFrom: JsonPath | null = null;

  protected readonly config = signal<WorkflowDefinition>(activeTab(this.tabs()).body);
  protected readonly selectedPath = signal('');
  protected readonly tab = signal<'visual' | 'json'>('visual');
  protected readonly publishing = signal(false);
  protected readonly toast = signal<string | null>(null);

  protected readonly issues = computed(() => validateWorkflow(this.config(), { workflows: this.catalog.catalog() }));
  protected readonly severity = computed(() => severityByNode(this.issues()));
  protected readonly errorCount = computed(() => this.issues().filter(i => i.severity === 'error').length);
  protected readonly catalogNote = computed(() =>
    this.catalog.workflows() ? null : 'subFlow references not checked (not connected to the service)',
  );

  protected readonly rootItems = computed<FlowItem[]>(() => {
    const tasks = this.config().tasks;
    return Array.isArray(tasks) ? tasks.map((t, i) => ({ task: isObject(t) ? t : {}, path: ['tasks', i] })) : [];
  });

  protected readonly outline = computed<OutlineRow[]>(() => {
    const rows: OutlineRow[] = [];
    const walk = (list: unknown, base: JsonPath, depth: number, title: string | null) => {
      if (title !== null) {
        rows.push({ kind: 'list', depth, path: base, key: pathToString(base) + '+', title });
      }
      const tasks = Array.isArray(list) ? list : [];
      tasks.forEach((task, i) => {
        const path = [...base, i];
        const t = isObject(task) ? task : {};
        rows.push({
          kind: 'task',
          depth: depth + (title !== null ? 1 : 0),
          path,
          key: pathToString(path),
          title: typeof t['label'] === 'string' && t['label'] ? t['label'] : '(no label)',
          type: String(t['type'] ?? '?'),
          component: typeof t['component'] === 'string' ? t['component'] : undefined,
          first: i === 0,
          last: i === tasks.length - 1,
        });
        for (const child of childTaskLists(t)) {
          walk(getAt(t, child.path), [...path, ...child.path], depth + (title !== null ? 2 : 1), child.title);
        }
      });
    };
    walk(this.config().tasks, ['tasks'], 0, null);
    return rows;
  });

  protected readonly task = computed<TaskConfig | null>(() => {
    const path = this.selectedPath();
    if (!path) {
      return null;
    }
    const node = getAt(this.config(), parsePath(path));
    return isObject(node) ? (node as TaskConfig) : null;
  });

  protected readonly taskTypes = TASK_TYPES;
  protected readonly components = KNOWN_COMPONENTS;
  protected readonly notificationTypes = NOTIFICATION_TYPES;
  protected readonly caseKeyText = caseKeyText;

  constructor() {
    // A stored version or a run's definition handed over by another page opens in a tab of its own.
    const queued = takeQueuedOpen<WorkflowDefinition>('workflow');
    if (queued) {
      this.openDocument(queued.body, 'The workflow', { reuse: true, note: queued.note });
    }
    effect(() => saveTabs('workflow', this.tabs()));
    if (this.catalog.workflows() === null && !this.catalog.loading()) {
      void this.catalog.refresh();
    }
  }

  // ---- tabs and document-level actions -----------------------------------------------------------------------

  protected reset(kind: 'blank' | 'sample'): void {
    this.openDocument(kind === 'blank' ? newWorkflow() : sampleWorkflow(), kind === 'blank' ? 'New workflow' : 'Sample workflow');
  }

  /** An entry of the tab bar's "+" menu. */
  protected onAdd(id: string): void {
    if (id === 'import') {
      this.importInput()?.nativeElement.click();
    } else {
      this.reset(id === 'sample' ? 'sample' : 'blank');
    }
  }

  /**
   * Opens a document in a new tab next to the shown one; the open tabs stay as they are. With `reuse`, a tab that
   * already holds the same document is shown instead.
   */
  private openDocument(next: WorkflowDefinition, what: string, options: { reuse?: boolean; note?: string } = {}): void {
    const before = this.tabs().tabs.length;
    this.show(openTab(this.tabs(), next, { reuse: options.reuse }));
    const opened = this.tabs().tabs.length > before ? `${what} opened in a new tab.` : `${what} is already open in this tab.`;
    this.flash([options.note, opened].filter(Boolean).join(' '), options.note ? 8000 : 4000);
  }

  protected selectTab(id: string): void {
    this.show(selectTab(this.tabs(), id));
  }

  /** Closes a tab without asking: its document goes to Closed tabs (unless it is an untouched starter). */
  protected closeTab(id: string): void {
    const tab = this.tabs().tabs.find(t => t.id === id);
    if (!tab) {
      return;
    }
    const body = id === this.tabs().active ? this.config() : tab.body;
    const kept = this.keep(body);
    this.show(closeTab(this.tabs(), id, newWorkflow));
    this.histories.delete(id);
    this.selections.delete(id);
    this.flash(`Closed “${body.label || '(no label)'}”.${kept ? ' Closed tabs reopens it.' : ''}`);
  }

  /** Makes `next` the tab state and shows its active tab, keeping each tab's selection. */
  private show(next: TabsState<WorkflowDefinition>): void {
    const current = this.tabs();
    this.selections.set(current.active, this.selectedPath());
    this.tabs.set(next);
    if (next.active !== current.active || activeTab(next).body !== this.config()) {
      this.config.set(activeTab(next).body);
      this.selectedPath.set(this.selections.get(next.active) ?? '');
    }
    this.historyTick.update(n => n + 1);
  }

  /** Adds a document to the closed-tabs list, unless it is an untouched starter. Returns whether it did. */
  private keep(doc: WorkflowDefinition): boolean {
    if (PRISTINE.some(p => sameValue(p, doc))) {
      return false;
    }
    this.savedDrafts.set(keepDraft('workflow', doc));
    return true;
  }

  // ---- history -----------------------------------------------------------------------------------------------------

  /** Every edit goes through here. Edits with the same `group` (a field path) that follow quickly undo together. */
  private commit(next: WorkflowDefinition, group: string | null = null): void {
    const current = this.config();
    if (next === current) {
      return;
    }
    this.history.record(current, group);
    this.setDocument(next);
  }

  /** Shows `doc` and writes it into the shown tab. commit() and undo / redo come through here. */
  private setDocument(doc: WorkflowDefinition): void {
    this.config.set(doc);
    this.tabs.update(s => updateActive(s, doc));
    this.historyTick.update(n => n + 1);
  }

  protected undo(): void {
    this.step(this.history.undo(this.config()), 'Nothing to undo');
  }

  protected redo(): void {
    this.step(this.history.redo(this.config()), 'Nothing to redo');
  }

  private step(doc: WorkflowDefinition | null, nothing: string): void {
    if (!doc) {
      this.flash(nothing, 1500);
      return;
    }
    this.setDocument(doc);
    // keep the selection when that task still exists
    if (this.selectedPath() && !isObject(getAt(doc, parsePath(this.selectedPath())))) {
      this.selectedPath.set('');
    }
  }

  // ---- closed tabs -------------------------------------------------------------------------------------------------

  protected toggleDrafts(event: MouseEvent): void {
    if (this.draftsMenu()) {
      this.draftsMenu.set(null);
      return;
    }
    this.savedDrafts.set(listSavedDrafts('workflow'));
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.draftsMenu.set({ top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) });
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.drafts-menu button')?.focus());
  }

  protected openDraft(draft: SavedDraft): void {
    this.draftsMenu.set(null);
    if (!isObject(draft.body)) {
      return;
    }
    // reopened: it leaves the list, and comes back to it if its tab is closed again
    this.savedDrafts.set(forgetDraft('workflow', draft.id));
    this.openDocument(draft.body as WorkflowDefinition, `“${draft.name || '(no label)'}”`, { reuse: true });
  }

  protected forget(draft: SavedDraft, event: Event): void {
    event.stopPropagation();
    this.savedDrafts.set(forgetDraft('workflow', draft.id));
  }

  protected draftTasks(draft: SavedDraft): number {
    return labelsIn(isObject(draft.body) ? draft.body['tasks'] : null).size;
  }

  protected onDocumentPointer(event: PointerEvent): void {
    if (this.draftsMenu() && !(event.target as Element).closest('.drafts-menu, .drafts-toggle')) {
      this.draftsMenu.set(null);
    }
  }

  // ---- find ----------------------------------------------------------------------------------------------------------

  protected focusSearch(): void {
    const box = this.searchBox()?.nativeElement;
    box?.focus();
    box?.select();
  }

  protected onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.nextMatch(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.query.set('');
      (event.target as HTMLElement).blur();
    }
  }

  protected nextMatch(direction: 1 | -1): void {
    const rows = this.matchRows();
    if (!rows.length) {
      return;
    }
    const at = this.matchIndex();
    const index = at < 0 ? (direction > 0 ? 0 : rows.length - 1) : (at + direction + rows.length) % rows.length;
    this.select(rows[index].key);
    this.reveal(rows[index].key, true);
  }

  /** Scrolls a task into view in the outline and, if asked, in the diagram. */
  private reveal(key: string, inDiagram: boolean): void {
    setTimeout(() => {
      const root = this.host.nativeElement;
      root.querySelector(`.outline-row[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
      if (inDiagram) {
        root.querySelector(`.canvas .task-node[data-path="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }
    });
  }

  // ---- keyboard ------------------------------------------------------------------------------------------------------

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.publishing() || this.showShortcuts()) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    // The document's undo, also inside fields: their values are bound to the document, so the browser's own undo
    // does not work there.
    if (mod && !event.altKey && key === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (mod && !event.altKey && key === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (mod && key === 'f') {
      event.preventDefault();
      this.focusSearch();
      return;
    }
    if (isTyping(event.target) || this.draftsMenu()) {
      return;
    }
    if (event.key === '?') {
      event.preventDefault();
      this.showShortcuts.set(true);
      return;
    }
    if (event.key === '/' && !mod) {
      event.preventDefault();
      this.focusSearch();
      return;
    }
    const path = this.task() ? parsePath(this.selectedPath()) : null;
    if (event.key === 'Escape' && this.selectedPath()) {
      this.select('');
      return;
    }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !mod) {
      const delta = event.key === 'ArrowUp' ? -1 : 1;
      if (event.altKey) {
        if (path) {
          event.preventDefault();
          this.moveTask(path, delta);
          this.reveal(this.selectedPath(), true);
        }
        return;
      }
      if (event.shiftKey) {
        return;
      }
      const rows = this.outline().filter(r => r.kind === 'task');
      if (!rows.length) {
        return;
      }
      event.preventDefault();
      const at = rows.findIndex(r => r.key === this.selectedPath());
      const next = at < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + delta));
      this.select(rows[next].key);
      this.reveal(rows[next].key, true);
      return;
    }
    if (!path) {
      return;
    }
    if (event.key === 'Delete' || (event.key === 'Backspace' && !mod)) {
      event.preventDefault();
      this.removeTask(path);
    } else if (mod && key === 'd') {
      event.preventDefault();
      this.duplicateTask();
    }
  }

  // ---- copy / paste ------------------------------------------------------------------------------------------------

  /** Copies (or cuts) the selected task as JSON, unless the copy is about text: a field, or selected text. */
  protected onCopy(event: ClipboardEvent, cut: boolean): void {
    const task = this.task();
    if (!task || this.dialogOpen() || isTyping(event.target) || hasTextSelection()) {
      return;
    }
    event.preventDefault();
    event.clipboardData?.setData('text/plain', JSON.stringify(task, null, 2));
    if (cut) {
      this.commit(setAt(this.config(), parsePath(this.selectedPath()), undefined));
      this.selectedPath.set('');
      this.flash(`Cut task “${task.label ?? '?'}”. Ctrl+V pastes it after the selected task.`);
    } else {
      this.flash(`Copied task “${task.label ?? '?'}”. Paste it here or in another workflow.`);
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    if (this.dialogOpen() || isTyping(event.target)) {
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const tasks = parseTasks(text);
    if (!tasks) {
      if (text.trim()) {
        this.flash('The clipboard holds no task. Copy a task (or its JSON) first.');
      }
      return;
    }
    event.preventDefault();
    this.pasteTasks(tasks);
  }

  /** Copy from the inspector's button (the keyboard uses the copy event). */
  protected async copyTask(): Promise<void> {
    const task = this.task();
    if (task) {
      await navigator.clipboard.writeText(JSON.stringify(task, null, 2));
      this.flash(`Copied task “${task.label ?? '?'}”. Paste it here or in another workflow.`);
    }
  }

  /** Paste from a button: reading the clipboard this way may ask for permission. */
  protected async pasteFromButton(): Promise<void> {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      this.flash('The browser did not allow reading the clipboard. Press Ctrl+V instead.');
      return;
    }
    const tasks = parseTasks(text);
    if (tasks) {
      this.pasteTasks(tasks);
    } else {
      this.flash('The clipboard holds no task. Copy a task (or its JSON) first.');
    }
  }

  protected duplicateTask(): void {
    const task = this.task();
    if (task) {
      this.pasteTasks([task], true);
    }
  }

  /** Inserts tasks after the selected task (or at the end of the root list), renaming labels that are taken. */
  private pasteTasks(tasks: TaskConfig[], duplicate = false): void {
    const { tasks: ready, renamed } = prepareForPaste(tasks, labelsIn(this.config().tasks));
    const selected = this.task() ? parsePath(this.selectedPath()) : null;
    const list = selected ? selected.slice(0, -1) : ['tasks'];
    const current = getAt(this.config(), list);
    const items = Array.isArray(current) ? current : [];
    const index = selected ? (selected[selected.length - 1] as number) + 1 : items.length;
    this.commit(setAt(this.config(), list, [...items.slice(0, index), ...ready, ...items.slice(index)]));
    const key = pathToString([...list, index]);
    this.selectedPath.set(key);
    this.reveal(key, true);
    const names = [...renamed].map(([from, to]) => `${from} → ${to}`);
    if (duplicate) {
      this.flash(`Duplicated “${tasks[0].label ?? '?'}” as “${ready[0].label ?? '?'}”${names.length > 1 ? `, with its inner tasks renamed` : ''}`);
      return;
    }
    this.flash(
      `Pasted ${ready.length === 1 ? `task “${ready[0].label ?? '?'}”` : `${ready.length} tasks`}` +
        (names.length ? ` (labels taken, so renamed: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''})` : ''),
      names.length ? 6000 : 3000,
    );
  }

  private dialogOpen(): boolean {
    return this.publishing() || this.showShortcuts();
  }

  // ---- diagram picture ---------------------------------------------------------------------------------------------

  protected async exportPicture(format: 'svg' | 'png'): Promise<void> {
    const el = this.diagram()?.nativeElement;
    if (!el) {
      return;
    }
    try {
      await exportDiagram(el, format, `${this.config().label || 'workflow'}-diagram`);
    } catch (e) {
      this.flash(`Could not save the picture: ${(e as Error).message}`, 6000);
    }
  }

  protected async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const parsed = unwrapImported('workflow', JSON.parse(await file.text()));
      if (!isObject(parsed)) {
        throw new Error('the file does not contain a JSON object');
      }
      this.openDocument(parsed as WorkflowDefinition, file.name, { reuse: true });
    } catch (e) {
      alert(`Could not import ${file.name}: ${(e as Error).message}`);
    }
  }

  protected exportFile(): void {
    download(`${this.config().label || 'workflow'}.json`, this.config());
  }

  protected async copyJson(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(this.config(), null, 2));
    this.flash('Workflow JSON copied');
  }

  protected onJsonEdited(value: unknown): void {
    if (isObject(value)) {
      this.commit(value as WorkflowDefinition, 'json');
    }
  }

  protected onPublished(saved: AnyEnvelope): void {
    const stored = toStored('workflow', saved);
    this.publishing.set(false);
    this.tabs.update(markPublished);
    this.flash(`Published ${stored.name} version ${stored.details.version}`);
    void this.catalog.refresh();
  }

  protected select(path: string): void {
    // Issue nodes are task paths (or '' for the root); anything else falls back to the closest task.
    const parts = parsePath(path);
    while (parts.length && !(typeof parts[parts.length - 1] === 'number' && isObject(getAt(this.config(), parts)))) {
      parts.pop();
    }
    this.selectedPath.set(pathToString(parts));
    this.tab.set('visual');
  }

  // ---- edits -----------------------------------------------------------------------------------------------------

  protected patch(path: JsonPath, value: unknown): void {
    this.commit(setAt(this.config(), path, value === '' ? undefined : value), pathToString(path));
  }

  protected patchTask(field: string | JsonPath, value: unknown): void {
    this.patch([...parsePath(this.selectedPath()), ...(Array.isArray(field) ? field : [field])], value);
  }

  protected addTask(listPath: JsonPath, template: TaskTemplate = TASK_TEMPLATES[0]): void {
    const list = getAt(this.config(), listPath);
    const tasks = Array.isArray(list) ? list : [];
    const task = template.create(this.uniqueLabel());
    this.patch(listPath, [...tasks, task]);
    this.selectedPath.set(pathToString([...listPath, tasks.length]));
  }

  /** Drag and drop on the diagram: same move as the outline's. */
  protected moveOnDiagram(move: { from: JsonPath; list: JsonPath; index: number }): void {
    const result = moveTaskTo(this.config(), move.from, move.list, move.index);
    if (result) {
      this.commit(result.doc);
      const path = findTaskPath(result.doc, result.moved);
      this.selectedPath.set(path ? pathToString(path) : '');
    }
  }

  /** Inserts a task from a template at a position of any task list (from the diagram). */
  protected insertTask(at: TaskInsert): void {
    const list = getAt(this.config(), at.list);
    const tasks = Array.isArray(list) ? list : [];
    const index = Math.min(at.index, tasks.length);
    const task = at.template.create(this.uniqueLabel());
    this.patch(at.list, [...tasks.slice(0, index), task, ...tasks.slice(index)]);
    this.selectedPath.set(pathToString([...at.list, index]));
  }

  protected removeTask(path: JsonPath): void {
    const task = getAt(this.config(), path) as TaskConfig;
    // no confirmation: Ctrl+Z (or Undo) brings the task back
    this.commit(setAt(this.config(), path, undefined));
    this.selectedPath.set('');
    const nested = childTaskLists(task ?? {}).some(c => labelsIn(getAt(task, c.path)).size);
    this.flash(`Deleted task “${task?.label ?? '?'}”${nested ? ' and the tasks inside it' : ''}. Ctrl+Z brings it back.`);
  }

  protected moveTask(path: JsonPath, delta: number): void {
    const listPath = path.slice(0, -1);
    const index = path[path.length - 1] as number;
    const list = [...(getAt(this.config(), listPath) as unknown[])];
    const target = index + delta;
    if (target < 0 || target >= list.length) {
      return;
    }
    [list[index], list[target]] = [list[target], list[index]];
    this.patch(listPath, list);
    this.selectedPath.set(pathToString([...listPath, target]));
  }

  protected startDrag(event: DragEvent, row: OutlineRow): void {
    this.dragFrom = row.path;
    this.dragKey.set(row.key);
    event.dataTransfer?.setData('text/plain', row.title);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  /** Accepts the drop unless it would put the task inside itself. */
  protected dragOver(event: DragEvent, key: string, list: JsonPath, _index: number): void {
    const from = this.dragFrom;
    if (!from || (list.length >= from.length && from.every((p, i) => list[i] === p))) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dropKey.set(key);
  }

  protected drop(event: DragEvent, list: JsonPath, index: number): void {
    event.preventDefault();
    const from = this.dragFrom;
    this.endDrag();
    if (!from) {
      return;
    }
    const result = moveTaskTo(this.config(), from, list, index);
    if (result) {
      this.commit(result.doc);
      const path = findTaskPath(result.doc, result.moved);
      this.selectedPath.set(path ? pathToString(path) : '');
    }
  }

  protected endDrag(): void {
    this.dragFrom = null;
    this.dragKey.set(null);
    this.dropKey.set(null);
  }

  /** Changing the type scaffolds the fields that type requires, so the task is valid right away. */
  protected changeType(type: string): void {
    const current = this.task() ?? {};
    const next: TaskConfig = { ...current, type };
    if ((WORKER_TASK_TYPES as readonly string[]).includes(type)) {
      next.component ??= 'logical';
    }
    if (isLogicalTask(next)) {
      delete next.retry;
    }
    switch (type) {
      case 'decision':
        next.expression ??= "${workflow['requestContext']['type']}";
        next.cases ??= [{ key: 'value', tasks: [] }];
        break;
      case 'for':
        next.list ??= "${workflow['requestContext']['items']}";
        next.tasks ??= [];
        break;
      case 'subFlow':
        next.flowName ??= '';
        break;
      case 'logical':
      case 'validate':
        next.expression ??= '${true}';
        break;
    }
    this.patchTask([], next);
  }

  /** Switching component scaffolds what that handler reads (http endpoint, logical expression). */
  protected changeComponent(component: string): void {
    const next: TaskConfig = { ...(this.task() ?? {}), component };
    if (!component) {
      delete next.component;
    }
    const input = isObject(next.inputParameters) ? next.inputParameters : {};
    if (component === 'http' && input['url'] == null && input['endpoint'] == null) {
      const fields = httpFields();
      next.inputParameters = { ...fields.inputParameters, ...input };
      next['successCondition'] ??= fields['successCondition'];
    }
    if (component === 'logical') {
      next.expression ??= '${true}';
      delete next.retry;
    }
    this.patchTask([], next);
  }

  protected httpInput(task: TaskConfig): Record<string, unknown> {
    return isObject(task.inputParameters) ? task.inputParameters : {};
  }

  protected patchHttp(field: string, value: unknown): void {
    this.patchTask(['inputParameters', field], value);
  }

  /** `inputParameters.endpoint` (a configured route name) replaces url/httpMethod/headers. */
  protected usesRoute(task: TaskConfig): boolean {
    return this.httpInput(task)['endpoint'] != null;
  }

  protected setHttpMode(mode: 'url' | 'route'): void {
    const { url, httpMethod, headers, endpoint, ...rest } = this.httpInput(this.task() ?? {});
    const direct = httpFields().inputParameters as Record<string, unknown>;
    this.patchTask(
      'inputParameters',
      mode === 'route'
        ? { endpoint: '', ...rest }
        : { url: url ?? direct['url'], httpMethod: httpMethod ?? 'POST', headers: headers ?? direct['headers'], ...rest },
    );
  }

  /** A mapResolver `map` is either an inline object or a SpEL expression string. */
  protected mapIsExpression(task: TaskConfig): boolean {
    return typeof task['map'] === 'string';
  }

  protected setMapMode(mode: 'inline' | 'expression'): void {
    const current = this.task()?.['map'];
    if (mode === 'expression' && typeof current !== 'string') {
      this.patchTask('map', "${workflow['requestContext']['map']}");
    } else if (mode === 'inline' && typeof current === 'string') {
      this.patchTask('map', { DEFAULT: { DEFAULT: 'defaultValue' } });
    }
  }

  protected addCase(): void {
    const cases = this.task()?.cases ?? [];
    this.patchTask('cases', [...cases, { key: `value${cases.length + 1}`, tasks: [] }]);
  }

  protected removeCase(index: number): void {
    this.patchTask('cases', (this.task()?.cases ?? []).filter((_, i) => i !== index));
  }

  /** Case keys are compared with `equals` against the evaluated expression, so keep numbers/booleans typed. */
  protected setCaseKey(index: number, raw: string): void {
    let key: unknown = raw;
    if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(raw.trim())) {
      key = JSON.parse(raw.trim());
    }
    this.patchTask(['cases', index, 'key'], key);
  }

  protected caseKeyInput(key: unknown): string {
    return typeof key === 'string' ? key : key === undefined ? '' : JSON.stringify(key);
  }

  protected toggleDefault(on: boolean): void {
    this.patchTask('default', on ? { tasks: [] } : undefined);
  }

  protected selectedPathParts(): JsonPath {
    return parsePath(this.selectedPath());
  }

  // ---- template helpers ------------------------------------------------------------------------------------------

  protected readonly isLogicalTask = isLogicalTask;
  protected readonly httpMethods = HTTP_METHODS;

  protected isWorker(type: unknown): boolean {
    return (WORKER_TASK_TYPES as readonly string[]).includes(type as string);
  }

  protected isKnownType(type: unknown): boolean {
    return (TASK_TYPES as readonly string[]).includes(type as string);
  }

  /** Severity of the issues about one field of the selected node: highlights its box in the inspector. */
  protected fieldSev(field: string): Severity | undefined {
    return fieldSeverity(this.issues(), this.selectedPath(), field);
  }

  protected sev(key: string): string | undefined {
    return this.severity().get(key);
  }

  protected issuesAt(node: string): string[] {
    return this.issues()
      .filter(i => i.node === node)
      .map(i => `${i.severity === 'error' ? '✖' : i.severity === 'warning' ? '▲' : 'i'} ${i.message}`);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** emailTo is a list; edited as one entry per line. */
  protected listText(value: unknown): string {
    return Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : '';
  }

  protected toList(text: string): string[] {
    return text
      .split(/[\n,;]/)
      .map(v => v.trim())
      .filter(Boolean);
  }


  protected numberOrUndefined(event: Event): number | undefined {
    const raw = this.value(event);
    return raw === '' ? undefined : Number(raw);
  }

  private uniqueLabel(): string {
    const taken = new Set(this.outline().filter(r => r.kind === 'task').map(r => r.title));
    let n = taken.size + 1;
    while (taken.has(`task${n}`)) {
      n++;
    }
    return `task${n}`;
  }

  private toastTimer?: ReturnType<typeof setTimeout>;

  private flash(message: string, ms = 3000): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), ms);
  }
}

/** Whether a key press or clipboard event belongs to a text field (which keeps its own keys). */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) {
    return false;
  }
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    return true;
  }
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes((el as HTMLInputElement).type);
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== '';
}
