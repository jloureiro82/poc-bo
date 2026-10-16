import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { NodeRun } from '../../core/executions';
import { Severity } from '../../core/issues';
import { JsonPath, isObject, pathToString } from '../../core/json-path';
import { WORKER_TASK_TYPES } from '../../core/model';
import { TaskTemplate } from '../../core/task-templates';
import { caseKeyText } from '../../core/workflow-validator';
import { TaskTemplateMenu } from '../../shared/task-template-menu';
import { DropPlace, TaskDragService } from './task-drag.service';

export interface FlowItem {
  task: Record<string, unknown>;
  path: JsonPath;
}

interface Branch {
  title: string;
  items: FlowItem[];
  /** The task list this branch shows (where new tasks go). */
  list: JsonPath;
  /** The path taken when no case matches and there is no `default`: nothing runs. */
  implicit?: boolean;
}

/** "Put a task made from this template at `index` of the list at `list`." */
export interface TaskInsert {
  list: JsonPath;
  index: number;
  template: TaskTemplate;
}

/** Renders a task list top-to-bottom; decision cases fan out into side-by-side branches, `for` into a loop box. */
@Component({
  selector: 'app-task-flow',
  imports: [TaskTemplateMenu, NgTemplateOutlet],
  template: `
    <div class="flow">
      @for (item of items(); track $index) {
        <div class="flow-item">
          <div class="connector"></div>
          <div class="node-wrap">
          <button
            [attr.draggable]="editable() && !!drag"
            (dragstart)="dragStart($event, item)"
            (dragend)="drag?.reset()"
            (dragover)="dragOverNode($event, item)"
            (drop)="dropOnNode($event, item)"
            [class.dragging]="drag?.fromKey() === key(item)"
            [class.drop-before]="isOver(key(item), 'before')"
            [class.drop-after]="isOver(key(item), 'after')"
            class="task-node"
            [class.selected]="selected() === key(item)"
            [attr.data-sev]="severity().get(key(item))"
            [attr.data-kind]="kindOf(item.task)"
            [attr.data-run]="runOf(item)"
            [attr.data-path]="key(item)"
            [class.match]="matches()?.has(key(item))"
            (click)="select.emit(key(item))"
            [title]="tooltip(item)"
          >
            <span class="task-type">{{ typeText(item.task) }}</span>
            <span class="task-label">{{ text(item.task['label'], '(no label)') }}</span>
            @if (detail(item.task); as d) {
              <code class="task-detail">{{ d }}</code>
            }
            @if (severity().get(key(item)); as sev) {
              <span class="sev-badge" [attr.data-sev]="sev">{{ sev === 'error' ? '✖' : sev === 'warning' ? '▲' : 'i' }}</span>
            }
            @if (attempts(item) > 1) {
              <span class="run-count">×{{ attempts(item) }}</span>
            }
          </button>
          @if (editable()) {
            <div class="task-actions">
              <button type="button" class="icon danger" title="Delete this task" aria-label="Delete this task" (click)="remove.emit(item.path)">✕</button>
            </div>
          }
          </div>

          @switch (item.task['type']) {
            @case ('decision') {
              <!-- decision -> split bar -> one column per case -> join bar -> next task -->
              <div class="vline"></div>
              <div class="branches">
                @for (b of branches(item); track $index) {
                  <div class="branch" [class.implicit]="b.implicit">
                    <div class="vline short"></div>
                    <div class="branch-title" [title]="b.implicit ? 'No case matches and there is no default: nothing runs' : ''">{{ b.title }}</div>
                    @if (b.items.length) {
                      <app-task-flow [items]="b.items" [severity]="severity()" [selected]="selected()" [editable]="editable()" [list]="b.list" [run]="run()" [matches]="matches()"
                                     (select)="select.emit($event)" (insert)="insert.emit($event)" (remove)="remove.emit($event)" (move)="move.emit($event)" />
                    } @else {
                      <div class="connector"></div>
                      <div class="branch-empty" [class.drop-into]="isOver(listKey(b.list), 'into')"
                           (dragover)="dragOverList($event, b.list)" (drop)="dropInto($event, b.list)">{{ b.implicit ? 'skipped' : '(nothing)' }}</div>
                      <!-- no "add" on the no-match path: a default with tasks fails in this engine (see the validator) -->
                      @if (editable() && !b.implicit) {
                        <app-task-template-menu label="+ add" title="Add a task to this branch" buttonClass="add-inline"
                                                (pick)="insert.emit({ list: b.list, index: 0, template: $event })" />
                      }
                    }
                    <!-- runs down to the join bar, so every case visibly rejoins the flow -->
                    <div class="branch-tail"></div>
                  </div>
                }
              </div>
            }
            @case ('loop') {
              <ng-container *ngTemplateOutlet="loopBox; context: { $implicit: item }" />
            }
            @case ('for') {
              <ng-container *ngTemplateOutlet="loopBox; context: { $implicit: item }" />
            }
          }
          @if (editable()) {
            <div class="insert-after">
              <app-task-template-menu label="+" title="Insert a task after this one" buttonClass="insert-btn"
                                      (pick)="insertAfter(item, $event)" />
            </div>
          }
        </div>
      }
    </div>

    <ng-template #loopBox let-item>
              <div class="loop">
                <div class="loop-title">
                  @if (item.task['type'] === 'loop') {
                    ↻ repeat until <code>{{ text(item.task['expression'], '?') }}</code>
                  } @else {
                    ↻ for each in <code>{{ text(item.task['list'], '?') }}</code>
                  }
                </div>
                @if (branches(item)[0].items.length) {
                  <app-task-flow [items]="branches(item)[0].items" [severity]="severity()" [selected]="selected()" [editable]="editable()" [run]="run()" [matches]="matches()"
                                 [list]="branches(item)[0].list" (select)="select.emit($event)" (insert)="insert.emit($event)" (remove)="remove.emit($event)" (move)="move.emit($event)" />
                } @else {
                  <div class="branch-empty" [class.drop-into]="isOver(listKey(branches(item)[0].list), 'into')"
                       (dragover)="dragOverList($event, branches(item)[0].list)" (drop)="dropInto($event, branches(item)[0].list)">(empty loop)</div>
                  @if (editable()) {
                    <app-task-template-menu label="+ add" title="Add a task to the loop body" buttonClass="add-inline"
                                            (pick)="insert.emit({ list: branches(item)[0].list, index: 0, template: $event })" />
                  }
                }
              </div>
    </ng-template>
  `,
})
export class TaskFlow {
  readonly items = input.required<FlowItem[]>();
  readonly severity = input.required<Map<string, Severity>>();
  readonly selected = input('');
  readonly select = output<string>();
  readonly editable = input(false);
  /** One execution laid over the diagram: node path -> how that task fared. Tasks that never ran are dimmed. */
  readonly run = input<Map<string, NodeRun> | null>(null);
  /** Paths of the tasks that match the editor's find box; they are highlighted. */
  readonly matches = input<Set<string> | null>(null);
  /** Path of the task list these items belong to. */
  readonly list = input<JsonPath>(['tasks']);
  readonly insert = output<TaskInsert>();
  readonly remove = output<JsonPath>();
  /** Drag and drop: move the task at `from` to `index` of the list at `list`. */
  readonly move = output<{ from: JsonPath; list: JsonPath; index: number }>();

  protected readonly drag = inject(TaskDragService, { optional: true });

  protected listKey(list: JsonPath): string {
    return pathToString(list) + '+';
  }

  protected isOver(key: string, place: DropPlace): boolean {
    const over = this.drag?.over();
    return !!over && over.key === key && over.place === place;
  }

  protected dragStart(event: DragEvent, item: FlowItem): void {
    if (!this.drag || !this.editable()) {
      return;
    }
    event.stopPropagation();
    this.drag.from.set(item.path);
    event.dataTransfer?.setData('text/plain', String(item.task['label'] ?? 'task'));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  /** Upper half of a task: drop before it; lower half: after it. */
  protected dragOverNode(event: DragEvent, item: FlowItem): void {
    const drag = this.drag;
    const list = item.path.slice(0, -1);
    if (!drag?.from() || !drag.accepts(list) || drag.fromKey() === this.key(item)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const place: DropPlace = event.clientY < box.top + box.height / 2 ? 'before' : 'after';
    drag.over.set({ key: this.key(item), place });
  }

  protected dropOnNode(event: DragEvent, item: FlowItem): void {
    const drag = this.drag;
    const over = drag?.over();
    const from = drag?.from();
    event.preventDefault();
    event.stopPropagation();
    drag?.reset();
    if (!from || !over || over.key !== this.key(item)) {
      return;
    }
    const index = (item.path[item.path.length - 1] as number) + (over.place === 'after' ? 1 : 0);
    this.move.emit({ from, list: item.path.slice(0, -1), index });
  }

  protected dragOverList(event: DragEvent, list: JsonPath): void {
    if (!this.drag?.from() || !this.drag.accepts(list)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.drag.over.set({ key: this.listKey(list), place: 'into' });
  }

  protected dropInto(event: DragEvent, list: JsonPath): void {
    const from = this.drag?.from();
    event.preventDefault();
    event.stopPropagation();
    this.drag?.reset();
    if (from) {
      this.move.emit({ from, list, index: 0 });
    }
  }

  /** Right after `item` in its own list. */
  protected insertAfter(item: FlowItem, template: TaskTemplate): void {
    this.insert.emit({ list: item.path.slice(0, -1), index: (item.path[item.path.length - 1] as number) + 1, template });
  }


  protected key(item: FlowItem): string {
    return pathToString(item.path);
  }

  protected branches(item: FlowItem): Branch[] {
    const t = item.task;
    const listAt = (rel: JsonPath, title: string): Branch => {
      let node: unknown = t;
      for (const p of rel) {
        node = isObject(node) || Array.isArray(node) ? (node as any)[p] : undefined;
      }
      const list = Array.isArray(node) ? node : [];
      return { title, list: [...item.path, ...rel], items: list.map((task, i) => ({ task: isObject(task) ? task : {}, path: [...item.path, ...rel, i] })) };
    };
    switch (t['type']) {
      case 'decision': {
        const cases = Array.isArray(t['cases']) ? t['cases'] : [];
        const result = cases.map((cs, i) => listAt(['cases', i, 'tasks'], `= ${caseKeyText(cs)}`));
        if (isObject(t['default'])) {
          result.push(listAt(['default', 'tasks'], 'default'));
        } else {
          // No default: when nothing matches, the decision runs nothing. Draw that path too, so every decision
          // shows its alternatives side by side.
          result.push({ title: 'no match', items: [], list: [...item.path, 'default', 'tasks'], implicit: true });
        }
        return result;
      }
      case 'for':
      case 'loop':
        return [listAt(['tasks'], 'loop')];
      default:
        return [];
    }
  }

  protected kindOf(task: Record<string, unknown>): string {
    const type = String(task['type'] ?? '');
    if ((WORKER_TASK_TYPES as readonly string[]).includes(type)) {
      return 'worker';
    }
    return type.toLowerCase() || 'unknown';
  }

  protected typeText(task: Record<string, unknown>): string {
    const type = String(task['type'] ?? '? no type');
    return task['component'] && (WORKER_TASK_TYPES as readonly string[]).includes(type) ? `${type} · ${task['component']}` : type;
  }

  protected detail(task: Record<string, unknown>): string | null {
    const value = task['expression'] ?? null;
    return typeof value === 'string' ? (value.length > 40 ? value.slice(0, 39) + '…' : value) : null;
  }

  protected tooltip(item: FlowItem): string {
    const task = item.task;
    const run = this.run();
    const ran = run ? (run.get(this.key(item))?.detail ?? 'did not run') : null;
    return [task['label'], task['description'], task['expression'], ran].filter(v => typeof v === 'string' && v).join('\n');
  }

  /** `none` marks a task the shown execution never reached. */
  protected runOf(item: FlowItem): string | null {
    const run = this.run();
    return run ? (run.get(this.key(item))?.status ?? 'none') : null;
  }

  protected attempts(item: FlowItem): number {
    return this.run()?.get(this.key(item))?.attempts ?? 0;
  }

  protected text(value: unknown, fallback: string): string {
    return typeof value === 'string' && value ? value : fallback;
  }
}
