import { Component, ElementRef, afterRenderEffect, inject, input, output, signal } from '@angular/core';

export interface TabLabel {
  id: string;
  title: string;
  /** the document has validation errors */
  errors: boolean;
  /** the document changed since it was opened or last published */
  edited: boolean;
}

/** One entry of the "+" menu, e.g. a blank document, a sample, an import. */
export interface AddOption {
  id: string;
  label: string;
  hint: string;
}

/**
 * The editor's tab bar: one tab per open document, marked ✖ for errors or with a dot for unpublished edits, a close
 * button on each, and "+" for the ways to open a new document.
 *
 * Keyboard (ARIA tabs, manual activation): only the shown tab is a tab stop; ←/→ and Home/End move the focus between
 * tabs, Enter or Space opens the focused one, Delete closes it. These keys stop here, so they never reach the editor's
 * own shortcuts (where Delete deletes the selected task).
 */
@Component({
  selector: 'app-editor-tabs',
  host: {
    '(document:pointerdown)': 'onDocumentPointer($event)',
  },
  template: `
    <div class="editor-tabs">
      <div class="editor-tab-list" role="tablist" aria-label="Open documents">
      @for (t of tabs(); track t.id; let i = $index) {
        <div class="editor-tab" role="presentation" [class.active]="t.id === active()">
          <button type="button" role="tab" class="editor-tab-open" [attr.aria-selected]="t.id === active()" [title]="describe(t)"
                  [attr.tabindex]="t.id === active() ? 0 : -1"
                  (click)="select.emit(t.id)" (auxclick)="closeOnMiddle($event, t.id)" (keydown)="onTabKey($event, i)">
            @if (t.errors) {
              <span class="tab-dot error" aria-hidden="true">✖</span><span class="visually-hidden">Has errors:</span>
            } @else if (t.edited) {
              <span class="tab-dot edited" aria-hidden="true"></span><span class="visually-hidden">Edited:</span>
            }
            <span class="editor-tab-title">{{ t.title }}</span>
          </button>
          <button type="button" class="editor-tab-close" [attr.aria-label]="'Close ' + t.title"
                  title="Close (it goes to Closed tabs)" (click)="close.emit(t.id)">✕</button>
        </div>
      }
      </div>
      <!-- outside the scrolling list, so it stays in view however many tabs are open -->
      <button type="button" class="editor-tab-add" title="Open a new document" aria-label="Open a new document"
              aria-haspopup="menu" [attr.aria-expanded]="!!menu()" (click)="toggleMenu($event)">+</button>
    </div>
    @if (menu(); as pos) {
      <div class="tab-add-menu" role="menu" aria-label="Open a new document" [style.top.px]="pos.top" [style.left.px]="pos.left"
           (keydown.escape)="closeMenu(true)">
        @for (o of addOptions(); track o.id) {
          <button type="button" role="menuitem" class="menu-item" (click)="choose(o.id)">
            <strong>{{ o.label }}</strong>
            <span class="muted small">{{ o.hint }}</span>
          </button>
        }
      </div>
    }
  `,
})
export class EditorTabs {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly tabs = input.required<TabLabel[]>();
  readonly active = input.required<string>();
  readonly addOptions = input.required<AddOption[]>();
  readonly select = output<string>();
  readonly close = output<string>();
  /** the id of the chosen "+" menu entry */
  readonly add = output<string>();

  /** Position of the open "+" menu (fixed, so no panel clips it), or `null`. */
  protected readonly menu = signal<{ top: number; left: number } | null>(null);

  constructor() {
    // keep the shown tab in view when it changes (a new tab opens at the end of a long, scrolled list)
    afterRenderEffect(() => {
      this.active();
      this.tabs();
      this.host.nativeElement.querySelector('.editor-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  protected describe(t: TabLabel): string {
    const state = t.errors ? 'has errors' : t.edited ? 'edited since it was opened or published' : '';
    return state ? `${t.title}: ${state}` : t.title;
  }

  /** Arrow keys, Home and End move the focus between tabs; Delete closes the focused tab. */
  protected onTabKey(event: KeyboardEvent, index: number): void {
    const count = this.tabs().length;
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    if (event.key in moves) {
      this.focusTab(moves[event.key]);
    } else if (event.key === 'Delete') {
      this.close.emit(this.tabs()[index].id);
      // the list has changed once Angular re-renders; focus the tab that took this one's place
      setTimeout(() => this.focusTab(Math.min(index, this.tabs().length - 1)));
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private focusTab(index: number): void {
    this.host.nativeElement.querySelectorAll<HTMLElement>('.editor-tab-open')[index]?.focus();
  }

  /** Middle click closes a tab, as in browsers. */
  protected closeOnMiddle(event: MouseEvent, id: string): void {
    if (event.button === 1) {
      event.preventDefault();
      this.close.emit(id);
    }
  }

  protected toggleMenu(event: MouseEvent): void {
    if (this.menu()) {
      this.closeMenu(false);
      return;
    }
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menu.set({ top: box.bottom + 4, left: Math.min(box.left, window.innerWidth - 300) });
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.tab-add-menu button')?.focus());
  }

  protected choose(id: string): void {
    this.closeMenu(false);
    this.add.emit(id);
  }

  protected closeMenu(refocus: boolean): void {
    this.menu.set(null);
    if (refocus) {
      this.host.nativeElement.querySelector<HTMLElement>('.editor-tab-add')?.focus();
    }
  }

  protected onDocumentPointer(event: PointerEvent): void {
    if (this.menu() && !(event.target as Element).closest('.tab-add-menu, .editor-tab-add')) {
      this.menu.set(null);
    }
  }
}
