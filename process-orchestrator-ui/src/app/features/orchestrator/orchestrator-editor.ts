import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { AnyEnvelope, toStored } from '../../core/config-api.service';
import { sameValue } from '../../core/diff';
import {
  MAX_SAVED_DRAFTS,
  SavedDraft,
  forgetDraft,
  keepDraft,
  listSavedDrafts,
  loadTabs,
  saveTabs,
  takeQueuedOpen,
  unwrapImported,
} from '../../core/drafts';
import { TabsState, activeTab, closeTab, openTab, selectTab, updateActive } from '../../core/editor-tabs';
import { History } from '../../core/history';
import { Severity, fieldSeverity, severityByNode } from '../../core/issues';
import { JsonPath, getAt, isObject, pathToString, setAt } from '../../core/json-path';
import {
  ACTIVITY_TYPES,
  ActivityConfig,
  FAILURE_ACTIONS,
  FailurePolicyConfig,
  OrchestratorConfig,
  STEP_TYPES,
  StepConfig,
  TIMEOUT_ACTIONS,
} from '../../core/model';
import { validateOrchestrator } from '../../core/orchestrator-validator';
import { newOrchestrator, sampleOrchestrator } from '../../core/samples';
import { WorkflowCatalogService } from '../../core/workflow-catalog.service';
import { exportDiagram } from '../../shared/diagram-export';
import { download } from '../../shared/download';
import { EditorTabs, TabLabel } from '../../shared/editor-tabs';
import { IssuesPanel } from '../../shared/issues-panel';
import { KeyActivate } from '../../shared/key-activate';
import { JsonDocument } from '../../shared/json-document';
import { JsonField } from '../../shared/json-field';
import { PublishDialog } from '../../shared/publish-dialog';
import { RunDialog } from '../../shared/run-dialog';
import { ORCHESTRATOR_SHORTCUTS, ShortcutsDialog } from '../../shared/shortcuts-dialog';
import { WorkflowSelect } from '../../shared/workflow-select';
import { ResizeHandle } from '../../shared/resize-handle';
import { AutoGrow } from '../../shared/auto-grow';
import { PanelSizesService } from '../../core/panel-sizes.service';
import { DiagramEdit, DiagramLink, OrchestratorDiagram } from './orchestrator-diagram';

interface Selection {
  step: number | null;
  activity: number | null;
}

/** A step or activity, in outline order (for find and the arrow keys). */
interface NodeRow {
  path: string;
  kind: 'step' | 'activity';
  label: string;
  /** Workflows it runs (its own, and its cancellation workflow). */
  workflows: string[];
}

/** Documents not worth keeping in the closed-tabs list: the starters, untouched. */
const PRISTINE = [newOrchestrator(), sampleOrchestrator()];

@Component({
  selector: 'app-orchestrator-editor',
  imports: [
    DatePipe,
    EditorTabs,
    OrchestratorDiagram,
    IssuesPanel,
    KeyActivate,
    JsonField,
    JsonDocument,
    PublishDialog,
    RunDialog,
    ShortcutsDialog,
    WorkflowSelect,
    ResizeHandle,
    AutoGrow,
  ],
  templateUrl: './orchestrator-editor.html',
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(document:pointerdown)': 'onDocumentPointer($event)',
  },
})
export class OrchestratorEditor {
  protected readonly catalog = inject(WorkflowCatalogService);
  protected readonly panels = inject(PanelSizesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  /**
   * The open tabs, one document each. `config` is the shown tab's document; commit() and undo / redo write it back
   * into its tab. Each tab has its own undo history and selection, kept here by tab id (not stored).
   */
  protected readonly tabs = signal<TabsState<OrchestratorConfig>>(loadTabs('orchestrator', sampleOrchestrator));
  protected readonly tabLabels = computed<TabLabel[]>(() =>
    this.tabs().tabs.map(t => ({ id: t.id, title: (t.id === this.tabs().active ? this.config() : t.body).label || '(no label)' })),
  );
  private readonly histories = new Map<string, History<OrchestratorConfig>>();
  private readonly selections = new Map<string, string>();

  /** Undo / redo of the shown tab. `historyTick` changes on every step so the buttons update. */
  private get history(): History<OrchestratorConfig> {
    const id = this.tabs().active;
    let history = this.histories.get(id);
    if (!history) {
      history = new History<OrchestratorConfig>();
      this.histories.set(id, history);
    }
    return history;
  }
  private readonly historyTick = signal(0);
  protected readonly canUndo = computed(() => (this.historyTick(), this.tabs(), this.history.canUndo));
  protected readonly canRedo = computed(() => (this.historyTick(), this.tabs(), this.history.canRedo));

  protected readonly running = signal(false);
  protected readonly showShortcuts = signal(false);
  protected readonly shortcuts = ORCHESTRATOR_SHORTCUTS;
  protected readonly maxDrafts = MAX_SAVED_DRAFTS;
  /** Closed tabs, newest first (stored as the saved drafts list). */
  protected readonly savedDrafts = signal<SavedDraft[]>(listSavedDrafts('orchestrator'));
  /** Position of the open closed-tabs menu (fixed, so no panel clips it), or `null`. */
  protected readonly draftsMenu = signal<{ top: number; right: number } | null>(null);

  protected readonly config = signal<OrchestratorConfig>(activeTab(this.tabs()).body);
  protected readonly selectedPath = signal('');
  protected readonly tab = signal<'visual' | 'json'>('visual');
  protected readonly publishing = signal(false);
  protected readonly toast = signal<string | null>(null);

  protected readonly issues = computed(() => validateOrchestrator(this.config(), { workflows: this.catalog.catalog() }));
  protected readonly severity = computed(() => severityByNode(this.issues()));
  protected readonly errorCount = computed(() => this.issues().filter(i => i.severity === 'error').length);
  protected readonly catalogNote = computed(() =>
    this.catalog.workflows()
      ? `Workflow references checked against ${this.catalog.workflows()!.length} stored workflows`
      : 'Workflow references not checked (not connected to the service)',
  );

  protected readonly steps = computed<StepConfig[]>(() => (Array.isArray(this.config().stepList) ? this.config().stepList! : []));
  protected readonly selection = computed<Selection>(() => parseSelection(this.selectedPath()));
  protected readonly step = computed(() => {
    const s = this.selection().step;
    return s == null ? null : (this.steps()[s] ?? null);
  });
  protected readonly activity = computed<ActivityConfig | null>(() => {
    const { step, activity } = this.selection();
    if (step == null || activity == null) {
      return null;
    }
    const list = this.steps()[step]?.activityList;
    return Array.isArray(list) ? (list[activity] ?? null) : null;
  });

  /** Every step and activity, in outline order. */
  protected readonly nodes = computed<NodeRow[]>(() =>
    this.steps().flatMap((s, si) => [
      { path: `stepList[${si}]`, kind: 'step' as const, label: s.label ?? '', workflows: [] },
      ...this.activitiesOf(si).map((a, ai) => ({
        path: `stepList[${si}].activityList[${ai}]`,
        kind: 'activity' as const,
        label: a.label ?? '',
        workflows: [a.workflowLabel, a.cancellationActivity?.label].filter((w): w is string => typeof w === 'string' && !!w),
      })),
    ]),
  );

  /** Find box: matching node paths, in outline order. */
  protected readonly query = signal('');
  protected readonly matchRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.nodes().filter(n => [n.label, ...n.workflows].some(v => v.toLowerCase().includes(q))) : [];
  });
  protected readonly matchKeys = computed(() => (this.query().trim() ? new Set(this.matchRows().map(r => r.path)) : null));
  protected readonly matchIndex = computed(() => this.matchRows().findIndex(r => r.path === this.selectedPath()));

  protected readonly stepTypes = STEP_TYPES;
  protected readonly activityTypes = ACTIVITY_TYPES;
  protected readonly failureActions = FAILURE_ACTIONS;
  protected readonly timeoutActions = TIMEOUT_ACTIONS;

  constructor() {
    // A stored version or a run's configuration handed over by another page opens in a tab of its own.
    const queued = takeQueuedOpen<OrchestratorConfig>('orchestrator');
    if (queued) {
      this.openDocument(queued.body, 'The configuration', { reuse: true, note: queued.note });
    }
    effect(() => saveTabs('orchestrator', this.tabs()));
    if (this.catalog.workflows() === null && !this.catalog.loading()) {
      void this.catalog.refresh();
    }
  }

  // ---- tabs and document-level actions -----------------------------------------------------------------------

  protected reset(kind: 'blank' | 'sample'): void {
    this.openDocument(kind === 'blank' ? newOrchestrator() : sampleOrchestrator(), kind === 'blank' ? 'New configuration' : 'Sample configuration');
  }

  /**
   * Opens a document in a new tab next to the shown one; the open tabs stay as they are. With `reuse`, a tab that
   * already holds the same document is shown instead.
   */
  private openDocument(next: OrchestratorConfig, what: string, options: { reuse?: boolean; note?: string } = {}): void {
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
    this.show(closeTab(this.tabs(), id, newOrchestrator));
    this.histories.delete(id);
    this.selections.delete(id);
    this.flash(`Closed “${body.label || '(no label)'}”.${kept ? ' Closed tabs reopens it.' : ''}`);
  }

  /** Makes `next` the tab state and shows its active tab, keeping each tab's selection. */
  private show(next: TabsState<OrchestratorConfig>): void {
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
  private keep(doc: OrchestratorConfig): boolean {
    if (PRISTINE.some(p => sameValue(p, doc))) {
      return false;
    }
    this.savedDrafts.set(keepDraft('orchestrator', doc));
    return true;
  }

  // ---- history -----------------------------------------------------------------------------------------------------

  /** Every edit goes through here. Edits with the same `group` (a field path) that follow quickly undo together. */
  private commit(next: OrchestratorConfig, group: string | null = null): void {
    const current = this.config();
    if (next === current) {
      return;
    }
    this.history.record(current, group);
    this.setDocument(next);
  }

  /** Shows `doc` and writes it into the shown tab. commit() and undo / redo come through here. */
  private setDocument(doc: OrchestratorConfig): void {
    this.config.set(doc);
    this.tabs.update(s => updateActive(s, doc));
    this.historyTick.update(n => n + 1);
  }

  protected undo(): void {
    this.applyHistory(this.history.undo(this.config()), 'Nothing to undo');
  }

  protected redo(): void {
    this.applyHistory(this.history.redo(this.config()), 'Nothing to redo');
  }

  private applyHistory(doc: OrchestratorConfig | null, nothing: string): void {
    if (!doc) {
      this.flash(nothing, 1500);
      return;
    }
    this.setDocument(doc);
    // keep the selection when that node still exists
    const sel = parseSelection(this.selectedPath());
    const exists = sel.activity != null ? !!this.activitiesOf(sel.step!)[sel.activity] : sel.step != null ? !!this.steps()[sel.step] : true;
    if (!exists) {
      this.selectedPath.set('');
    }
  }

  // ---- closed tabs -------------------------------------------------------------------------------------------------

  protected toggleDrafts(event: MouseEvent): void {
    if (this.draftsMenu()) {
      this.draftsMenu.set(null);
      return;
    }
    this.savedDrafts.set(listSavedDrafts('orchestrator'));
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
    this.savedDrafts.set(forgetDraft('orchestrator', draft.id));
    this.openDocument(draft.body as OrchestratorConfig, `“${draft.name || '(no label)'}”`, { reuse: true });
  }

  protected forget(draft: SavedDraft, event: Event): void {
    event.stopPropagation();
    this.savedDrafts.set(forgetDraft('orchestrator', draft.id));
  }

  protected draftSteps(draft: SavedDraft): number {
    const list = isObject(draft.body) ? draft.body['stepList'] : null;
    return Array.isArray(list) ? list.length : 0;
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
    this.select(rows[index].path);
    this.reveal(rows[index].path);
  }

  /** Scrolls a node into view in the outline and the diagram. */
  private reveal(path: string): void {
    setTimeout(() => {
      const root = this.host.nativeElement;
      root.querySelector(`.outline-row[data-key="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'nearest' });
      root.querySelector(`.canvas [data-node="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  }

  // ---- keyboard ------------------------------------------------------------------------------------------------------

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.publishing() || this.running() || this.showShortcuts()) {
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
    // A link selected on the diagram takes Escape and Delete for itself.
    const linkSelected = !!this.host.nativeElement.querySelector('.canvas .edge.sel');
    const sel = this.selection();
    if (event.key === 'Escape' && this.selectedPath() && !linkSelected) {
      this.select('');
      return;
    }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !mod) {
      const delta = event.key === 'ArrowUp' ? -1 : 1;
      if (event.altKey) {
        if (sel.step != null) {
          event.preventDefault();
          if (sel.activity != null) {
            const target = sel.activity + delta;
            if (target >= 0 && target < this.activitiesOf(sel.step).length) {
              this.moveActivity(sel.step, sel.activity, delta);
            }
          } else if (sel.step + delta >= 0 && sel.step + delta < this.steps().length) {
            this.moveStep(sel.step, delta);
          }
          this.reveal(this.selectedPath());
        }
        return;
      }
      if (event.shiftKey) {
        return;
      }
      const rows = this.nodes();
      if (!rows.length) {
        return;
      }
      event.preventDefault();
      const at = rows.findIndex(r => r.path === this.selectedPath());
      const next = at < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + delta));
      this.select(rows[next].path);
      this.reveal(rows[next].path);
      return;
    }
    if ((event.key === 'Delete' || (event.key === 'Backspace' && !mod)) && sel.step != null && !linkSelected) {
      event.preventDefault();
      if (sel.activity != null) {
        this.removeActivity(sel.step, sel.activity);
      } else {
        this.removeStep(sel.step);
      }
    }
  }

  // ---- diagram picture ---------------------------------------------------------------------------------------------

  protected async exportPicture(format: 'svg' | 'png'): Promise<void> {
    const svg = this.host.nativeElement.querySelector<SVGSVGElement>('.canvas app-orchestrator-diagram svg');
    if (!svg) {
      this.flash('There is no diagram to save yet: add a step first.');
      return;
    }
    try {
      await exportDiagram(svg, format, `${this.config().label || 'orchestrator'}-diagram`);
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
      const parsed = unwrapImported('orchestrator', JSON.parse(await file.text()));
      if (!isObject(parsed)) {
        throw new Error('the file does not contain a JSON object');
      }
      this.openDocument(parsed as OrchestratorConfig, file.name, { reuse: true });
    } catch (e) {
      alert(`Could not import ${file.name}: ${(e as Error).message}`);
    }
  }

  protected exportFile(): void {
    download(`${this.config().label || 'orchestrator'}.json`, this.config());
  }

  protected async copyJson(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(this.config(), null, 2));
    this.flash('Configuration JSON copied');
  }

  protected onJsonEdited(value: unknown): void {
    if (isObject(value)) {
      this.commit(value as OrchestratorConfig, 'json');
    }
  }

  protected onPublished(saved: AnyEnvelope): void {
    const stored = toStored('orchestrator', saved);
    this.publishing.set(false);
    this.flash(`Published ${stored.name} version ${stored.details.version}`);
  }

  // ---- selection -------------------------------------------------------------------------------------------------

  protected select(path: string): void {
    // Issues may point at a field path; select the closest step/activity.
    const sel = parseSelection(path);
    this.selectedPath.set(
      sel.step == null ? '' : sel.activity == null ? `stepList[${sel.step}]` : `stepList[${sel.step}].activityList[${sel.activity}]`,
    );
    this.tab.set('visual');
  }

  // ---- generic edits ---------------------------------------------------------------------------------------------

  protected patch(path: JsonPath, value: unknown): void {
    this.commit(setAt(this.config(), path, value === '' ? undefined : value), pathToString(path));
  }

  protected patchStep(field: string, value: unknown): void {
    this.patch(['stepList', this.selection().step!, field], value);
  }

  protected patchActivity(field: string | JsonPath, value: unknown): void {
    const { step, activity } = this.selection();
    this.patch(['stepList', step!, 'activityList', activity!, ...(Array.isArray(field) ? field : [field])], value);
  }

  // ---- edits from the diagram --------------------------------------------------------------------------------------

  protected onDiagramEdit(edit: DiagramEdit): void {
    switch (edit.kind) {
      case 'add-step':
        return edit.after == null ? this.addStep() : this.addStepAfter(parseSelection(edit.after).step!);
      case 'add-activity': {
        const si = parseSelection(edit.step).step!;
        return edit.after == null ? this.addActivity(si) : this.addActivityAfter(si, parseSelection(edit.after).activity!);
      }
      case 'remove': {
        const sel = parseSelection(edit.path);
        return sel.activity == null ? this.removeStep(sel.step!) : this.removeActivity(sel.step!, sel.activity);
      }
      case 'link':
        return this.setLink(edit.link, true);
      case 'unlink':
        return this.setLink(edit.link, false);
    }
  }

  /** A new step that runs after step `si`, placed right after it in the list. */
  private addStepAfter(si: number): void {
    const steps = this.steps();
    const after = steps[si]?.label;
    const step: StepConfig = {
      label: uniqueLabel('step', steps.map(s => s.label)),
      ...(after ? { previousStep: [after] } : {}),
      activityList: [{ label: 'activity1', workflowLabel: '' }],
    };
    this.patch(['stepList'], [...steps.slice(0, si + 1), step, ...steps.slice(si + 1)]);
    this.selectedPath.set(`stepList[${si + 1}]`);
  }

  /** A new activity that runs after activity `ai` of step `si`, placed right after it. */
  private addActivityAfter(si: number, ai: number): void {
    const list = this.activitiesOf(si);
    const after = list[ai]?.label;
    const activity: ActivityConfig = {
      label: uniqueLabel('activity', list.map(a => a.label)),
      ...(after ? { previousActivity: [after] } : {}),
      workflowLabel: '',
    };
    this.patch(['stepList', si, 'activityList'], [...list.slice(0, ai + 1), activity, ...list.slice(ai + 1)]);
    this.selectedPath.set(`stepList[${si}].activityList[${ai + 1}]`);
  }

  /** Adds or removes "`to` runs after `from`" (previousStep / previousActivity). */
  private setLink(link: DiagramLink, on: boolean): void {
    const from = parseSelection(link.from);
    const to = parseSelection(link.to);
    const isActivity = from.activity != null;
    const fromNode = isActivity ? this.activitiesOf(from.step!)[from.activity!] : this.steps()[from.step!];
    const label = fromNode?.label;
    if (!label || (isActivity && from.step !== to.step)) {
      return;
    }
    const key = isActivity ? 'previousActivity' : 'previousStep';
    const path = isActivity ? ['stepList', to.step!, 'activityList', to.activity!] : ['stepList', to.step!];
    const current = (getAt(this.config(), [...path, key]) as string[] | undefined) ?? [];
    const next = on ? [...new Set([...current, label])] : current.filter(l => l !== label);
    this.patch([...path, key], next.length ? next : undefined);
    this.selectedPath.set(link.to);
    this.flash(on ? `"${String(getAt(this.config(), [...path, 'label']))}" now runs after "${label}"` : `Link from "${label}" removed`);
  }

  // ---- steps -----------------------------------------------------------------------------------------------------

  protected addStep(): void {
    const steps = this.steps();
    const label = uniqueLabel('step', steps.map(s => s.label));
    const last = steps[steps.length - 1]?.label;
    const step: StepConfig = {
      label,
      ...(last ? { previousStep: [last] } : {}),
      activityList: [{ label: 'activity1', workflowLabel: '' }],
    };
    this.patch(['stepList'], [...steps, step]);
    this.selectedPath.set(`stepList[${steps.length}]`);
  }

  protected renameStep(newLabel: string): void {
    const index = this.selection().step!;
    const old = this.steps()[index].label;
    this.commit({
      ...this.config(),
      stepList: this.steps().map((s, i) =>
        i === index ? { ...s, label: newLabel } : { ...s, ...renameRef(s, 'previousStep', old, newLabel) },
      ),
    });
  }

  protected removeStep(index: number): void {
    const steps = this.steps();
    const removed = steps[index];
    // no confirmation: Ctrl+Z (or Undo) brings the step back
    const rest = steps.filter((_, i) => i !== index).map(s => bypass(s, 'previousStep', removed.label, removed.previousStep));
    this.patch(['stepList'], rest);
    this.selectedPath.set('');
    this.flash(`Deleted step “${removed.label ?? '#' + (index + 1)}” and its activities. Ctrl+Z brings it back.`);
  }

  protected moveStep(index: number, delta: number): void {
    this.patch(['stepList'], move(this.steps(), index, delta));
    this.selectedPath.set(`stepList[${index + delta}]`);
  }

  protected togglePreviousStep(label: string, on: boolean): void {
    const current = this.step()?.previousStep ?? [];
    const next = on ? [...current, label] : current.filter(l => l !== label);
    this.patchStep('previousStep', next.length ? next : undefined);
  }

  // ---- activities ------------------------------------------------------------------------------------------------

  protected activitiesOf(stepIndex: number): ActivityConfig[] {
    const list = this.steps()[stepIndex]?.activityList;
    return Array.isArray(list) ? list : [];
  }

  protected addActivity(stepIndex: number): void {
    const list = this.activitiesOf(stepIndex);
    const last = list[list.length - 1]?.label;
    const activity: ActivityConfig = {
      label: uniqueLabel('activity', list.map(a => a.label)),
      ...(last ? { previousActivity: [last] } : {}),
      workflowLabel: '',
    };
    this.patch(['stepList', stepIndex, 'activityList'], [...list, activity]);
    this.selectedPath.set(`stepList[${stepIndex}].activityList[${list.length}]`);
  }

  protected renameActivity(newLabel: string): void {
    const { step, activity } = this.selection();
    const list = this.activitiesOf(step!);
    const old = list[activity!].label;
    this.patch(
      ['stepList', step!, 'activityList'],
      list.map((a, i) => (i === activity ? { ...a, label: newLabel } : { ...a, ...renameRef(a, 'previousActivity', old, newLabel) })),
    );
  }

  protected removeActivity(stepIndex: number, index: number): void {
    const list = this.activitiesOf(stepIndex);
    const removed = list[index];
    const rest = list
      .filter((_, i) => i !== index)
      .map(a => bypass(a, 'previousActivity', removed.label, removed.previousActivity));
    this.patch(['stepList', stepIndex, 'activityList'], rest);
    this.selectedPath.set(`stepList[${stepIndex}]`);
    this.flash(`Deleted activity “${removed.label ?? '#' + (index + 1)}”. Ctrl+Z brings it back.`);
  }

  protected moveActivity(stepIndex: number, index: number, delta: number): void {
    this.patch(['stepList', stepIndex, 'activityList'], move(this.activitiesOf(stepIndex), index, delta));
    this.selectedPath.set(`stepList[${stepIndex}].activityList[${index + delta}]`);
  }

  protected togglePreviousActivity(label: string, on: boolean): void {
    const current = this.activity()?.previousActivity ?? [];
    const next = on ? [...current, label] : current.filter(l => l !== label);
    this.patchActivity('previousActivity', next.length ? next : undefined);
  }

  protected setFailureAction(action: string): void {
    const current = { ...(this.activity()?.onFailure ?? {}) };
    if (action !== 'hold') {
      // the hold timeout only applies to hold
      delete current.holdTimeout;
      delete current.onTimeout;
    }
    this.patchActivity('onFailure', action ? { ...current, action } : undefined);
    if (action === 'cancel' && !this.activity()?.cancellationActivity) {
      this.patchActivity('cancellationActivity', { active: true, label: '' });
    }
  }

  protected setFailurePolicyField(field: 'holdTimeout' | 'onTimeout', raw: string): void {
    const next: FailurePolicyConfig = { ...(this.activity()?.onFailure ?? {}) };
    const trimmed = raw.trim();
    if (trimmed) {
      next[field] = trimmed;
    } else {
      delete next[field];
      if (field === 'holdTimeout') {
        delete next.onTimeout;
      }
    }
    this.patchActivity('onFailure', next);
    if (field === 'onTimeout' && trimmed === 'cancel' && !this.activity()?.cancellationActivity) {
      this.patchActivity('cancellationActivity', { active: true, label: '' });
    }
  }

  protected toggleCancellation(on: boolean): void {
    this.patchActivity('cancellationActivity', on ? { active: true, label: '' } : undefined);
  }

  // ---- template helpers ------------------------------------------------------------------------------------------

  /** Severity of the issues about one field of the selected node: highlights its box in the inspector. */
  protected fieldSev(field: string): Severity | undefined {
    return fieldSeverity(this.issues(), this.selectedPath(), field);
  }

  protected sev(path: string): string | undefined {
    return this.severity().get(path);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** `''` / `'true'` / `'false'` select for optional booleans. */
  protected triState(event: Event): boolean | undefined {
    const v = this.value(event);
    return v === '' ? undefined : v === 'true';
  }

  protected boolText(value: unknown): string {
    return value === true ? 'true' : value === false ? 'false' : '';
  }

  protected issuesAt(prefix: string): string[] {
    return this.issues()
      .filter(i => i.node === prefix)
      .map(i => `${i.severity === 'error' ? '✖' : i.severity === 'warning' ? '▲' : 'i'} ${i.message}`);
  }

  protected getAt = getAt;

  private toastTimer?: ReturnType<typeof setTimeout>;

  private flash(message: string, ms = 3000): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), ms);
  }
}

/** Whether a key press belongs to a text field (which keeps its own keys). */
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

function parseSelection(path: string): Selection {
  const m = /^stepList\[(\d+)\](?:\.activityList\[(\d+)\])?/.exec(path);
  return m ? { step: Number(m[1]), activity: m[2] != null ? Number(m[2]) : null } : { step: null, activity: null };
}

function uniqueLabel(prefix: string, taken: (string | undefined)[]): string {
  let n = taken.length + 1;
  while (taken.includes(`${prefix}${n}`)) {
    n++;
  }
  return `${prefix}${n}`;
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) {
    return list;
  }
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** Updates a `previousX` list after a rename, so links keep working. */
function renameRef(node: Record<string, unknown>, key: string, old: string | undefined, next: string): Record<string, unknown> {
  const refs = node[key];
  if (!old || !Array.isArray(refs) || !refs.includes(old)) {
    return {};
  }
  return { [key]: refs.map(r => (r === old ? next : r)) };
}

/** After deleting a node, its successors inherit its predecessors (or become entries when it was the entry). */
function bypass<T extends Record<string, unknown>>(node: T, key: string, removed: string | undefined, removedPrevious: unknown): T {
  const refs = node[key];
  if (!removed || !Array.isArray(refs) || !refs.includes(removed)) {
    return node;
  }
  const inherited = Array.isArray(removedPrevious) ? removedPrevious : [];
  const next = [...new Set([...refs.filter(r => r !== removed), ...inherited])];
  const copy: Record<string, unknown> = { ...node };
  if (next.length) {
    copy[key] = next;
  } else {
    delete copy[key];
  }
  return copy as T;
}
