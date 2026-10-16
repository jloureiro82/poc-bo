import { Component, ElementRef, OnDestroy, afterNextRender, output, viewChild } from '@angular/core';
import { trapTab } from './dialog-focus';

export interface Shortcut {
  keys: string[];
  does: string;
}

/** The editor's keyboard shortcuts. Keys apply when focus is not in a text field, unless marked. */
export const EDITOR_SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: 'Anywhere in the editor',
    items: [
      { keys: ['Ctrl', 'Z'], does: 'Undo' },
      { keys: ['Ctrl', 'Y'], does: 'Redo (also Ctrl + Shift + Z)' },
      { keys: ['Ctrl', 'F'], does: 'Find a task by label, type or component' },
    ],
  },
  {
    group: 'With a task selected',
    items: [
      { keys: ['↑'], does: 'Select the previous task (outline order)' },
      { keys: ['↓'], does: 'Select the next task' },
      { keys: ['Alt', '↑'], does: 'Move the task up in its list' },
      { keys: ['Alt', '↓'], does: 'Move the task down in its list' },
      { keys: ['Ctrl', 'D'], does: 'Duplicate the task' },
      { keys: ['Ctrl', 'C'], does: 'Copy the task (as JSON, so it can be pasted into another workflow)' },
      { keys: ['Ctrl', 'X'], does: 'Cut the task' },
      { keys: ['Ctrl', 'V'], does: 'Paste tasks after it (into the root list when the workflow is selected)' },
      { keys: ['Delete'], does: 'Delete the task' },
      { keys: ['Esc'], does: 'Select the workflow' },
    ],
  },
  {
    group: 'In the tab bar (with a tab focused)',
    items: [
      { keys: ['←'], does: 'Focus the previous tab (→: the next one)' },
      { keys: ['Home'], does: 'Focus the first tab (End: the last one)' },
      { keys: ['Enter'], does: 'Open the focused tab' },
      { keys: ['Delete'], does: 'Close the focused tab (it goes to Closed tabs)' },
    ],
  },
  {
    group: 'Other',
    items: [
      { keys: ['/'], does: 'Find a task' },
      { keys: ['Enter'], does: 'In the find box: go to the next match (Shift + Enter: previous)' },
      { keys: ['?'], does: 'Show this list' },
    ],
  },
];

@Component({
  selector: 'app-shortcuts-dialog',
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <div class="backdrop" (click)="$event.target === $event.currentTarget && closed.emit()">
      <div #dialog class="dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        @for (g of groups; track g.group) {
          <h3>{{ g.group }}</h3>
          <dl class="shortcuts">
            @for (s of g.items; track s.does) {
              <dt>@for (k of s.keys; track $index) {@if ($index) { + }<kbd>{{ k }}</kbd>}</dt>
              <dd>{{ s.does }}</dd>
            }
          </dl>
        }
        <p class="muted small">On a Mac, Cmd works in place of Ctrl.</p>
        <div class="actions">
          <button class="primary" (click)="closed.emit()">Close</button>
        </div>
      </div>
    </div>
  `,
})
export class ShortcutsDialog implements OnDestroy {
  readonly closed = output<void>();
  protected readonly groups = EDITOR_SHORTCUTS;
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly opener = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('button')?.focus());
  }

  ngOnDestroy(): void {
    if (this.opener?.isConnected) {
      this.opener.focus();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === '?') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.closed.emit();
    } else {
      trapTab(event, this.dialog().nativeElement);
    }
  }
}
