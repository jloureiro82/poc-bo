import { Component, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { TASK_TEMPLATES, TaskTemplate } from '../core/task-templates';

const MENU_WIDTH = 290;

/**
 * A button that opens the list of task templates; emits the one picked. The menu is `position: fixed` next to the
 * button, so scrolling or narrow panels (like the outline) never clip it.
 *
 * Keyboard: opening focuses the first template; arrow keys, Home and End move between templates; Enter picks;
 * Escape closes and returns focus to the button; Tab closes and moves on.
 */
@Component({
  selector: 'app-task-template-menu',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
    '(window:resize)': 'open.set(false)',
    '(document:scroll)': 'open.set(false)',
    class: 'template-menu-host',
  },
  template: `
    <button #trigger type="button" [class]="buttonClass()" [title]="title()" [attr.aria-label]="label() === '+' ? title() : null"
            aria-haspopup="menu" [attr.aria-expanded]="open()" (click)="toggle(); $event.stopPropagation()"
            (keydown.arrowdown)="openAt('first', $event)" (keydown.arrowup)="openAt('last', $event)">{{ label() }}</button>
    @if (open()) {
      <!-- tabindex -1: Chrome makes a scrolling box without tabbable children a tab stop of its own -->
      <div #menu class="template-menu" role="menu" tabindex="-1" [attr.aria-label]="title()" [style.left.px]="position().left"
           [style.top.px]="position().top" [style.max-height.px]="position().maxHeight" (keydown)="onMenuKeydown($event)">
        @for (t of templates; track t.id) {
          <button type="button" role="menuitem" tabindex="-1" (click)="choose(t); $event.stopPropagation()">
            <strong>{{ t.name }}</strong>
            <small class="muted">{{ t.description }}</small>
          </button>
        }
      </div>
    }
  `,
})
export class TaskTemplateMenu {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  readonly label = input('+ task');
  readonly title = input('Add a task');
  readonly buttonClass = input('add-row step');
  readonly pick = output<TaskTemplate>();

  protected readonly open = signal(false);
  protected readonly position = signal({ left: 0, top: 0, maxHeight: 400 });
  protected readonly templates = TASK_TEMPLATES;

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.show('first');
  }

  /** ArrowDown / ArrowUp on the closed button open the menu at the first / last template. */
  protected openAt(item: 'first' | 'last', event: Event): void {
    if (!this.open()) {
      event.preventDefault();
      this.show(item);
    }
  }

  private show(focus: 'first' | 'last'): void {
    // Below the button when there is room, otherwise above it; always inside the window.
    const r = this.trigger().nativeElement.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const placeBelow = below >= 320 || below >= above;
    const maxHeight = Math.max(160, Math.min(520, placeBelow ? below : above));
    this.position.set({ left, top: placeBelow ? r.bottom + 4 : r.top - 4 - maxHeight, maxHeight });
    this.open.set(true);
    afterNextRender(() => this.focusItem(focus === 'first' ? 0 : -1), { injector: this.injector });
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this.items();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const target: Record<string, number> = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: -1 };
    if (event.key in target) {
      event.preventDefault();
      this.focusItem(target[event.key]);
    } else if (event.key === 'Tab') {
      // Close; Tab moves on from the button as if the menu had not been there, Shift+Tab lands on the button.
      if (event.shiftKey) {
        event.preventDefault();
      }
      this.trigger().nativeElement.focus();
      this.open.set(false);
    }
  }

  protected onEscape(): void {
    if (this.open()) {
      this.open.set(false);
      this.trigger().nativeElement.focus();
    }
  }

  /** Focuses the item at `index`, wrapping around; -1 is the last one. */
  private focusItem(index: number): void {
    const items = this.items();
    items[(index + items.length) % items.length]?.focus();
  }

  private items(): HTMLButtonElement[] {
    return Array.from(this.menu()?.nativeElement.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []);
  }

  protected choose(template: TaskTemplate): void {
    this.open.set(false);
    this.trigger().nativeElement.focus();
    this.pick.emit(template);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
