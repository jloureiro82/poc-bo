import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { NodeRun } from '../../core/executions';
import { Severity } from '../../core/issues';
import { ActivityNode, Edge, StepNode, layoutOrchestrator } from '../../core/orchestrator-layout';
import { DiagramViewport } from '../../shared/diagram-viewport';
import { KeyActivate } from '../../shared/key-activate';

/** A link drawn by dragging from one node's port onto another: `to` will run after `from`. */
export interface DiagramLink {
  from: string;
  to: string;
}

/** Edits requested from the diagram; the editor applies them. */
export type DiagramEdit =
  | { kind: 'add-step'; after: string | null }
  | { kind: 'add-activity'; step: string; after: string | null }
  | { kind: 'remove'; path: string }
  | { kind: 'link'; link: DiagramLink }
  | { kind: 'unlink'; link: DiagramLink };

interface Drag {
  from: string;
  kind: 'step' | 'activity';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  target: string | null;
}

@Component({
  selector: 'app-orchestrator-diagram',
  imports: [DiagramViewport, KeyActivate],
  host: {
    '(document:pointermove)': 'onDrag($event)',
    '(document:pointerup)': 'endDrag($event)',
    '(document:keydown.escape)': 'cancel()',
    '(document:keydown.delete)': 'deleteSelectedEdge()',
  },
  template: `
    @if (editable()) {
      <div class="diagram-tools">
        <button type="button" class="ghost" (click)="emitAddStep(null)" title="Add a step at the end of the flow">+ Step</button>
        <span class="muted small hint">Hover a node for actions · drag a ● onto another node to link it · click an arrow to remove it · keyboard: Tab, Enter, Delete</span>
      </div>
    }
    <app-diagram-viewport (availableWidth)="width.set($event)">
      @if (layout().steps.length === 0) {
        <div class="empty">
          <p class="muted">This flow has no steps yet.</p>
          @if (editable()) {
            <button type="button" class="primary" (click)="emitAddStep(null)">+ Add the first step</button>
          }
        </div>
      } @else {
        <svg
          #svg
          [attr.width]="layout().width"
          [attr.height]="layout().height"
          [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height"
          [class.editable]="editable()"
          [class.dragging]="drag()"
          role="group"
          aria-label="Orchestrator flow diagram"
          (click)="selectedEdge.set(null)"
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" class="arrow-head" />
            </marker>
            <marker id="arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" class="arrow-head bad" />
            </marker>
            <marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" class="arrow-head sel" />
            </marker>
          </defs>

          @if (layout().start; as start) {
            <circle [attr.cx]="start.x" [attr.cy]="start.y" r="8" class="start-dot" />
            <text [attr.x]="start.x" [attr.y]="start.y - 14" text-anchor="middle" class="start-text">start</text>
          }

          @for (edge of layout().stepEdges; track $index) {
            <path [attr.d]="edge.d" class="edge step-edge" [class.bad]="edge.broken" [class.sel]="isSelected(edge)"
                  [attr.marker-end]="isSelected(edge) ? 'url(#arrow-sel)' : edge.broken ? 'url(#arrow-bad)' : 'url(#arrow)'" />
            @if (editable() && edge.from) {
              <path [attr.d]="edge.d" class="edge-hit" keyActivate role="button" [attr.aria-label]="edgeName(edge)" (click)="pickEdge(edge, $event)"><title>Click to select this link</title></path>
            }
          }

          @for (step of layout().steps; track step.path) {
            <g class="step-group" [attr.transform]="'translate(' + step.x + ',' + step.y + ')'"
               [attr.data-node]="step.path" data-kind="step" [class.drop-target]="drag()?.target === step.path">
              <rect
                class="step"
                [class.selected]="selected() === step.path"
                [class.match]="matches()?.has(step.path)"
                [attr.data-sev]="severity().get(step.path)"
                [attr.data-run]="runOf(step.path)"
                [attr.width]="step.w"
                [attr.height]="step.h"
                rx="12"
                (click)="select.emit(step.path)"
              />
              <g class="step-head" keyActivate role="button" [attr.aria-label]="'Step ' + step.label" [attr.aria-current]="selected() === step.path || null"
                 (click)="select.emit(step.path)">
                <text x="14" y="22" class="step-title">{{ step.label }}</text>
                <text x="14" y="38" class="step-meta">
                  {{ clip(stepMeta(step), (step.w - 40) / 6) }}
                  <title>{{ stepMeta(step) }}</title>
                </text>
                @if (severity().get(step.path); as sev) {
                  <text [attr.x]="step.w - 14" y="24" text-anchor="end" class="sev-mark" [attr.data-sev]="sev">
                    {{ sev === 'error' ? '✖' : sev === 'warning' ? '▲' : 'i' }}
                  </text>
                }
              </g>

              @if (editable()) {
                <!-- actions, top right; the port on the right edge starts a link to another step -->
                <g class="node-actions" [attr.transform]="'translate(' + (step.w - 186) + ', -14)'">
                  <g class="act-btn" keyActivate role="button" (click)="emitAddActivity(step, null); $event.stopPropagation()" (pointerdown)="$event.stopPropagation()">
                    <rect width="74" height="22" rx="11" /><text x="37" y="15" text-anchor="middle">+ activity</text>
                    <title>Add an activity at the end of this step</title>
                  </g>
                  <g class="act-btn" keyActivate role="button" transform="translate(78, 0)" (click)="emitAddStep(step.path); $event.stopPropagation()" (pointerdown)="$event.stopPropagation()">
                    <rect width="74" height="22" rx="11" /><text x="37" y="15" text-anchor="middle">+ step →</text>
                    <title>Add a step that runs after this one</title>
                  </g>
                  <g class="act-btn danger" keyActivate role="button" transform="translate(156, 0)" (click)="emitRemove(step.path); $event.stopPropagation()" (pointerdown)="$event.stopPropagation()">
                    <rect width="26" height="22" rx="11" /><text x="13" y="15" text-anchor="middle">✕</text>
                    <title>Delete this step</title>
                  </g>
                </g>
                <circle class="port" [attr.cx]="step.w" cy="24" r="7" (pointerdown)="startDrag($event, step.path, 'step', step.x + step.w, step.y + 24)">
                  <title>Drag onto another step to make it run after this one</title>
                </circle>
              }

              @for (a of step.activities; track a.path) {
                <g
                  class="activity"
                  keyActivate
                  role="button"
                  [attr.aria-label]="'Activity ' + a.label"
                  [attr.aria-current]="selected() === a.path || null"
                  [class.selected]="selected() === a.path"
                  [class.match]="matches()?.has(a.path)"
                  [class.drop-target]="drag()?.target === a.path"
                  [attr.data-node]="a.path"
                  data-kind="activity"
                  [attr.data-sev]="severity().get(a.path)"
                  [attr.data-run]="runOf(a.path)"
                  [attr.transform]="'translate(' + a.x + ',' + a.y + ')'"
                  (click)="select.emit(a.path); $event.stopPropagation()"
                >
                  <title>{{ tooltip(a) }}{{ run()?.get(a.path) ? '\n— this run: ' + run()!.get(a.path)!.detail : (run() ? '\n— did not run' : '') }}</title>
                  <rect [attr.width]="a.w" [attr.height]="a.h" rx="8" [class.auto]="a.automatic" />
                  <text x="10" y="20" class="act-title">{{ clip(a.label, 22) }}</text>
                  <text x="10" y="38" class="act-wf">⚙ {{ clip(a.workflowLabel, 24) }}</text>
                  <g transform="translate(10, 50)">
                    <rect class="tag" [class.tag-auto]="a.automatic" width="58" height="16" rx="8" />
                    <text x="29" y="12" text-anchor="middle" class="tag-text">{{ a.automatic ? 'auto' : 'manual' }}</text>
                    @if (a.onFailure) {
                      <rect class="tag tag-fail" x="62" width="70" height="16" rx="8" />
                      <text x="97" y="12" text-anchor="middle" class="tag-text">on fail: {{ a.onFailure }}</text>
                    }
                    @if (a.cancellation) {
                      <rect class="tag tag-cancel" [attr.x]="a.onFailure ? 136 : 62" width="40" height="16" rx="8" />
                      <text [attr.x]="(a.onFailure ? 136 : 62) + 20" y="12" text-anchor="middle" class="tag-text">↺ undo</text>
                    }
                  </g>
                  @if (a.entry) {
                    <rect x="0" y="8" width="4" [attr.height]="a.h - 16" rx="2" class="start-bar"><title>Entry activity of the step</title></rect>
                  }
                  @if (run()?.get(a.path); as r) {
                    <g [attr.transform]="'translate(' + (a.w - 8) + ', ' + (a.h - 8) + ')'">
                      @if (r.attempts > 1) {
                        <rect x="-30" y="-14" width="30" height="16" rx="8" class="run-badge" />
                        <text x="-15" y="-2" text-anchor="middle" class="run-badge-text">×{{ r.attempts }}</text>
                      }
                      @if (r.cancelled) {
                        <rect [attr.x]="r.attempts > 1 ? -66 : -32" y="-14" width="32" height="16" rx="8" class="run-badge cancel" />
                        <text [attr.x]="(r.attempts > 1 ? -66 : -32) + 16" y="-2" text-anchor="middle" class="run-badge-text">↺</text>
                      }
                    </g>
                  }
                  @if (a.condition) {
                    <text [attr.x]="a.w - 10" y="20" text-anchor="end" class="cond-mark">◇</text>
                  }
                  @if (severity().get(a.path); as sev) {
                    <text [attr.x]="a.w - 10" y="38" text-anchor="end" class="sev-mark" [attr.data-sev]="sev">
                      {{ sev === 'error' ? '✖' : sev === 'warning' ? '▲' : 'i' }}
                    </text>
                  }
                  @if (editable()) {
                    <g class="node-actions" [attr.transform]="'translate(' + (a.w - 96) + ', ' + (a.h - 11) + ')'">
                      <g class="act-btn" keyActivate role="button" (click)="emitAddActivity(step, a.path); $event.stopPropagation()" (pointerdown)="$event.stopPropagation()">
                        <rect width="62" height="22" rx="11" /><text x="31" y="15" text-anchor="middle">+ next</text>
                        <title>Add an activity that runs after this one</title>
                      </g>
                      <g class="act-btn danger" keyActivate role="button" transform="translate(66, 0)" (click)="emitRemove(a.path); $event.stopPropagation()" (pointerdown)="$event.stopPropagation()">
                        <rect width="26" height="22" rx="11" /><text x="13" y="15" text-anchor="middle">✕</text>
                        <title>Delete this activity</title>
                      </g>
                    </g>
                    <circle class="port" [attr.cx]="a.w / 2" [attr.cy]="a.h" r="6"
                            (pointerdown)="startDrag($event, a.path, 'activity', step.x + a.x + a.w / 2, step.y + a.y + a.h)">
                      <title>Drag onto another activity of this step to make it run after this one</title>
                    </circle>
                  }
                </g>
              }
            </g>
          }

          @for (edge of layout().activityEdges; track $index) {
            <path [attr.d]="edge.d" class="edge" [class.bad]="edge.broken" [class.sel]="isSelected(edge)"
                  [attr.marker-end]="isSelected(edge) ? 'url(#arrow-sel)' : edge.broken ? 'url(#arrow-bad)' : 'url(#arrow)'" />
            @if (editable()) {
              <path [attr.d]="edge.d" class="edge-hit" keyActivate role="button" [attr.aria-label]="edgeName(edge)" (click)="pickEdge(edge, $event)"><title>Click to select this link</title></path>
            }
          }

          @if (selectedEdge(); as sel) {
            <g class="edge-menu" [attr.transform]="'translate(' + sel.x + ',' + sel.y + ')'" (click)="$event.stopPropagation()"
               (pointerdown)="$event.stopPropagation()">
              <g class="act-btn danger" keyActivate role="button" aria-label="Remove link" (click)="unlinkSelected()">
                <rect x="-62" y="-13" width="124" height="26" rx="13" />
                <text y="5" text-anchor="middle">✕ remove link</text>
              </g>
            </g>
          }

          @if (drag(); as d) {
            <line class="drag-line" [class.ok]="d.target" [attr.x1]="d.x1" [attr.y1]="d.y1" [attr.x2]="d.x2" [attr.y2]="d.y2" />
          }
        </svg>
      }
    </app-diagram-viewport>
    @if (run()) {
      <div class="legend small muted">
        <span><i class="sw run-ok"></i> succeeded</span>
        <span><i class="sw run-failed"></i> failed</span>
        <span><i class="sw run-cancelled"></i> cancelled</span>
        <span><i class="sw run-running"></i> running / on hold</span>
        <span><i class="sw run-none"></i> did not run</span>
        <span>×2 ran twice (retry / rerun)</span>
        <span>↺ cancellation ran</span>
      </div>
    } @else {
      <div class="legend small muted">
        <span><i class="dot start"></i> flow start · green edge: entry activity of a step</span>
        <span><i class="sw manual"></i> manual activity (waits for a request)</span>
        <span><i class="sw auto"></i> automatic activity (chains on completion)</span>
        <span>◇ has condition</span>
        <span>↺ cancellation workflow</span>
      </div>
    }
  `,
})
export class OrchestratorDiagram {
  readonly config = input.required<unknown>();
  readonly issues = input.required<Map<string, Severity>>();
  readonly selected = input<string>('');
  /** Execution overlay: how each node fared in one run (nodes absent from the map did not run). */
  readonly run = input<Map<string, NodeRun> | null>(null);
  /** Show the editing affordances (actions, ports, removable links). */
  readonly editable = input(false);
  /** Paths of the nodes that match the editor's find box; they are highlighted. */
  readonly matches = input<Set<string> | null>(null);
  readonly select = output<string>();
  readonly edit = output<DiagramEdit>();

  protected readonly severity = computed(() => this.issues());
  /** Width of the visible area; long flows wrap their steps onto new rows to fit it. */
  protected readonly width = signal(Infinity);
  protected readonly layout = computed(() => layoutOrchestrator(this.config(), this.width()));
  /** Node label by path, for accessible names. */
  private readonly labels = computed(
    () =>
      new Map<string, string>(
        this.layout().steps.flatMap(s => [[s.path, s.label] as const, ...s.activities.map(a => [a.path, a.label] as const)]),
      ),
  );
  protected readonly drag = signal<Drag | null>(null);
  protected readonly selectedEdge = signal<(DiagramLink & { x: number; y: number }) | null>(null);

  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');

  protected runOf(path: string): string | null {
    const run = this.run();
    return run ? (run.get(path)?.status ?? 'none') : null;
  }

  // ---- actions ---------------------------------------------------------------------------------------------------

  protected emitAddStep(after: string | null): void {
    this.edit.emit({ kind: 'add-step', after });
  }

  protected emitAddActivity(step: StepNode, after: string | null): void {
    this.edit.emit({ kind: 'add-activity', step: step.path, after });
  }

  protected emitRemove(path: string): void {
    this.edit.emit({ kind: 'remove', path });
  }

  // ---- links: select / remove ------------------------------------------------------------------------------------

  protected pickEdge(edge: Edge, event: MouseEvent): void {
    event.stopPropagation();
    // A click from the keyboard (detail 0) has no pointer position: put the menu at the middle of the link.
    const path = event.currentTarget as SVGPathElement;
    const p = event.detail === 0 ? path.getPointAtLength(path.getTotalLength() / 2) : this.toSvg(event);
    this.selectedEdge.set({ from: edge.from, to: edge.to, x: p.x, y: p.y });
  }

  protected isSelected(edge: Edge): boolean {
    const sel = this.selectedEdge();
    return !!sel && sel.from === edge.from && sel.to === edge.to;
  }

  protected unlinkSelected(): void {
    const sel = this.selectedEdge();
    if (sel) {
      this.edit.emit({ kind: 'unlink', link: { from: sel.from, to: sel.to } });
      this.selectedEdge.set(null);
    }
  }

  protected deleteSelectedEdge(): void {
    const active = document.activeElement;
    if (this.selectedEdge() && !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      this.unlinkSelected();
    }
  }

  protected cancel(): void {
    this.drag.set(null);
    this.selectedEdge.set(null);
  }

  // ---- links: drag from a port onto a node -----------------------------------------------------------------------

  protected startDrag(event: PointerEvent, from: string, kind: 'step' | 'activity', x: number, y: number): void {
    event.stopPropagation();
    event.preventDefault();
    this.selectedEdge.set(null);
    this.drag.set({ from, kind, x1: x, y1: y, x2: x, y2: y, target: null });
  }

  protected onDrag(event: PointerEvent): void {
    const d = this.drag();
    if (!d) {
      return;
    }
    const p = this.toSvg(event);
    this.drag.set({ ...d, x2: p.x, y2: p.y, target: this.targetAt(event, d) });
  }

  protected endDrag(event: PointerEvent): void {
    const d = this.drag();
    if (!d) {
      return;
    }
    this.drag.set(null);
    const target = this.targetAt(event, d);
    if (target) {
      this.edit.emit({ kind: 'link', link: { from: d.from, to: target } });
    }
  }

  /** The node under the pointer that the drag may link to: same kind, not itself, activities within the same step. */
  private targetAt(event: PointerEvent, d: Drag): string | null {
    // Dropping anywhere on a step (including over one of its activities) targets that step.
    const el = document.elementFromPoint(event.clientX, event.clientY)?.closest(`[data-kind="${d.kind}"]`);
    const path = el?.getAttribute('data-node') ?? null;
    if (!path || path === d.from) {
      return null;
    }
    if (d.kind === 'activity' && path.split('.activityList')[0] !== d.from.split('.activityList')[0]) {
      return null;
    }
    return path;
  }

  private toSvg(event: MouseEvent): { x: number; y: number } {
    const svg = this.svg()?.nativeElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) {
      return { x: 0, y: 0 };
    }
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  // ---- text ------------------------------------------------------------------------------------------------------

  protected stepMeta(step: StepNode): string {
    return [
      step.automatic ? 'automatic' : 'manual',
      step.sync ? 'sync' : '',
      step.entry ? 'entry' : '',
      step.after ? `after ${step.after.join(' or ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** Accessible name of a link, by the labels of the nodes it joins. */
  protected edgeName(edge: Edge): string {
    return `Link: ${this.labels().get(edge.to) ?? edge.to} runs after ${this.labels().get(edge.from) ?? edge.from}`;
  }

  protected clip(value: string, max: number): string {
    return value.length > max ? value.slice(0, max - 1) + '…' : value;
  }

  protected tooltip(a: ActivityNode): string {
    return [
      `${a.label} → workflow ${a.workflowLabel}`,
      a.condition ? `condition: ${a.condition}` : '',
      a.cancellation ? `cancellation workflow: ${a.cancellation}` : '',
      a.after ? `runs after ${a.after.join(' or ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
