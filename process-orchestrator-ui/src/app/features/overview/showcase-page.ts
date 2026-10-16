import { Directive, ElementRef, OnDestroy, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { SECTIONS } from './overview-content';

/**
 * Behaviour shared by the overview pages: blocks marked `.reveal` fade in as they scroll into view, the mobile menu
 * (`#burger` button, Escape to close, focus back to the button), and smooth scrolling to the sections.
 * The host scrolls (`overflow-y: auto`), so the page never moves the app shell.
 */
@Directive({
  host: {
    '[class.js-reveal]': 'revealReady()',
    '[class.menu-open]': 'menuOpen()',
    '(document:keydown.escape)': 'closeMenu(true)',
  },
})
export abstract class ShowcasePage implements OnDestroy {
  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly burger = viewChild<ElementRef<HTMLButtonElement>>('burger');
  private observer?: IntersectionObserver;

  protected readonly sections = SECTIONS;
  protected readonly menuOpen = signal(false);
  /** Hide the not-yet-revealed blocks only once the observer runs, so the page never stays blank without it. */
  protected readonly revealReady = signal(false);

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        return;
      }
      this.observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              this.observer?.unobserve(entry.target);
            }
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
      );
      this.host.nativeElement.querySelectorAll('.reveal').forEach(el => this.observer!.observe(el));
      this.revealReady.set(true);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu(true);
    } else {
      this.menuOpen.set(true);
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.sc-menu button')?.focus(), 50);
    }
  }

  protected closeMenu(returnFocus: boolean): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      if (returnFocus) {
        this.burger()?.nativeElement.focus();
      }
    }
  }

  protected scrollTo(id: string): void {
    this.closeMenu(false);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.host.nativeElement.querySelector(`#${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
}
