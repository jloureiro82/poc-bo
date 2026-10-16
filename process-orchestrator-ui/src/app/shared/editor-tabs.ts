import { Component, input, output } from '@angular/core';

export interface TabLabel {
  id: string;
  title: string;
}

/** The editor's tab bar: one tab per open document, a close button on each, and "+" for a new document. */
@Component({
  selector: 'app-editor-tabs',
  template: `
    <div class="editor-tabs" role="tablist" aria-label="Open documents">
      @for (t of tabs(); track t.id) {
        <div class="editor-tab" role="presentation" [class.active]="t.id === active()">
          <button type="button" role="tab" class="editor-tab-open" [attr.aria-selected]="t.id === active()" [title]="t.title"
                  (click)="select.emit(t.id)" (auxclick)="closeOnMiddle($event, t.id)">
            {{ t.title }}
          </button>
          <button type="button" class="editor-tab-close" [attr.aria-label]="'Close ' + t.title"
                  title="Close (it goes to Closed tabs)" (click)="close.emit(t.id)">✕</button>
        </div>
      }
      <button type="button" class="editor-tab-add" title="New tab" aria-label="New tab" (click)="add.emit()">+</button>
    </div>
  `,
})
export class EditorTabs {
  readonly tabs = input.required<TabLabel[]>();
  readonly active = input.required<string>();
  readonly select = output<string>();
  readonly close = output<string>();
  readonly add = output<void>();

  /** Middle click closes a tab, as in browsers. */
  protected closeOnMiddle(event: MouseEvent, id: string): void {
    if (event.button === 1) {
      event.preventDefault();
      this.close.emit(id);
    }
  }
}
