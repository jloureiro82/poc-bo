import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TASK_TEMPLATES } from '../../core/task-templates';
import { FEATURES, STEPS } from './overview-content';
import { ShowcasePage } from './showcase-page';

/**
 * Overview page: light "soft structural" look (silver-white, very large bold type, very soft shadows) with cards that
 * overlap and lean, settling straight as they scroll in. Every claim on it is something the app does; the lists come
 * from overview-content.ts and the task templates the editors use.
 */
@Component({
  selector: 'app-overview',
  imports: [RouterLink],
  host: { class: 'showcase' },
  template: `
    <!-- Floating island nav -------------------------------------------------------------------------------------->
    <nav class="sc-nav" aria-label="Overview">
      <a class="sc-brand" routerLink="/overview" (click)="scrollTo('top')">
        <span class="brand-mark" aria-hidden="true"></span>Flow Configurator
      </a>
      <div class="sc-nav-links">
        @for (s of sections; track s.id) {
          <button type="button" class="sc-nav-link" (click)="scrollTo(s.id)">{{ s.label }}</button>
        }
      </div>
      <a class="sc-btn sc-btn-sm sc-nav-cta" routerLink="/orchestrator">
        Open editor<span class="sc-btn-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 11 L11 5 M6 5 H11 V10" /></svg></span>
      </a>
      <button #burger type="button" class="sc-burger" [class.open]="menuOpen()" (click)="toggleMenu()"
              [attr.aria-expanded]="menuOpen()" aria-controls="s2-menu" [attr.aria-label]="menuOpen() ? 'Close menu' : 'Open menu'">
        <span></span><span></span>
      </button>
    </nav>

    <div id="s2-menu" class="sc-menu" [class.open]="menuOpen()" [attr.aria-hidden]="!menuOpen()"
         [attr.inert]="menuOpen() ? null : ''">
      <ul>
        @for (s of sections; track s.id; let i = $index) {
          <li [style.--i]="i"><button type="button" (click)="scrollTo(s.id)">{{ s.label }}</button></li>
        }
        <li [style.--i]="sections.length"><a routerLink="/orchestrator">Orchestrator editor</a></li>
        <li [style.--i]="sections.length + 1"><a routerLink="/workflow">Workflow editor</a></li>
        <li [style.--i]="sections.length + 2"><a routerLink="/executions">Executions</a></li>
      </ul>
    </div>

    <main class="s2-main" [attr.inert]="menuOpen() ? '' : null">
      <!-- Hero: huge verbs, then the product's three views leaning on each other -------------------------------->
      <section id="top" class="s2-hero">
        <div class="s2-hero-copy reveal">
          <span class="sc-eyebrow">Configuration studio</span>
          <h1>Draw. Check.<br />Publish. Replay.</h1>
          <p class="s2-lead">
            One place for process-orchestrator configurations. Draw orchestrators and workflows as diagrams, and get
            the engine's own rules as you type. Publish numbered versions, and replay every execution on the flow it ran.
          </p>
          <div class="sc-ctas center">
            <a class="sc-btn" routerLink="/orchestrator">
              Open the orchestrator editor<span class="sc-btn-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 11 L11 5 M6 5 H11 V10" /></svg></span>
            </a>
            <a class="sc-btn sc-btn-ghost" routerLink="/workflow">Workflow editor</a>
          </div>
        </div>

        <div class="s2-cascade" role="img"
             aria-label="Three views of the app: a flow diagram, the inspector showing a field in error, and an execution timeline">
          <!-- diagram -->
          <div class="s2-card s2-card-a reveal" style="--r: -5deg; --i: 1">
            <div class="s2-shell"><div class="s2-core">
              <div class="s2-card-head"><span>approvalFlow</span><em>Diagram</em></div>
              <div class="s2-mini-flow">
                <div class="s2-mini-step">
                  <strong>intake</strong><small>manual · entry</small>
                  <span class="s2-chip ok">submit</span><span class="s2-chip ok">approve</span>
                </div>
                <i class="s2-mini-arrow"></i>
                <div class="s2-mini-step">
                  <strong>process</strong><small>automatic</small>
                  <span class="s2-chip run">handle ×2</span><span class="s2-chip idle">notify</span>
                </div>
              </div>
            </div></div>
          </div>
          <!-- inspector with the field in error highlighted -->
          <div class="s2-card s2-card-b reveal" style="--r: 2deg; --i: 0">
            <div class="s2-shell"><div class="s2-core">
              <div class="s2-card-head"><span>Activity</span><em>Inspector</em></div>
              <div class="s2-issue"><b aria-hidden="true">✖</b> workflowLabel is required: it is the workflow this activity runs</div>
              <div class="s2-field"><span>Label *</span><div class="s2-input">submit</div></div>
              <div class="s2-field err"><span>Workflow *</span><div class="s2-input">(choose a workflow)<i>⌄</i></div></div>
              <div class="s2-field-row">
                <div class="s2-field"><span>Type</span><div class="s2-input">manual<i>⌄</i></div></div>
                <div class="s2-field"><span>Sync</span><div class="s2-input">(unset)<i>⌄</i></div></div>
              </div>
            </div></div>
          </div>
          <!-- execution timeline -->
          <div class="s2-card s2-card-c reveal" style="--r: 6deg; --i: 2">
            <div class="s2-shell"><div class="s2-core">
              <div class="s2-card-head"><span>Execution</span><em class="ok">completed</em></div>
              <div class="s2-bars">
                <div><span>validate</span><i class="ok" style="--l: 0%; --w: 22%"></i></div>
                <div><span>prepare</span><i class="ok" style="--l: 24%; --w: 10%"></i></div>
                <div><span>commit</span><i class="fail" style="--l: 44%; --w: 18%"></i></div>
                <div><span>commit ×2</span><i class="ok" style="--l: 84%; --w: 12%"></i></div>
              </div>
            </div></div>
          </div>
        </div>
      </section>

      <!-- Features: a zig-zag of leaning cards ------------------------------------------------------------------->
      <section id="features" class="s2-section">
        <header class="s2-head reveal">
          <span class="sc-eyebrow">Features</span>
          <h2>Everything between a draft and a running flow.</h2>
        </header>
        <ol class="s2-stack">
          @for (f of features; track f.title; let i = $index) {
            <li class="s2-card reveal" [style.--r]="(i % 2 ? 1.5 : -1.5) + 'deg'" [class.right]="i % 2 === 1">
              <div class="s2-shell"><div class="s2-core s2-feature">
                <span class="s2-icon" aria-hidden="true">
                  @switch (f.icon) {
                    @case ('diagram') {
                      <svg viewBox="0 0 32 32"><rect x="3" y="5" width="11" height="8" rx="2" /><rect x="18" y="19" width="11" height="8" rx="2" /><path d="M14 9 H21 V19" /></svg>
                    }
                    @case ('check') {
                      <svg viewBox="0 0 32 32"><path d="M16 3 L27 7 V15 C27 22 22 27 16 29 C10 27 5 22 5 15 V7 Z" /><path d="M11 16 L15 20 L22 12" /></svg>
                    }
                    @case ('versions') {
                      <svg viewBox="0 0 32 32"><path d="M16 4 L28 10 L16 16 L4 10 Z" /><path d="M4 16 L16 22 L28 16" /><path d="M4 22 L16 28 L28 22" /></svg>
                    }
                    @case ('replay') {
                      <svg viewBox="0 0 32 32"><path d="M5 9 H17" /><path d="M10 16 H27" /><path d="M7 23 H20" /><circle cx="17" cy="9" r="2" /><circle cx="20" cy="23" r="2" /></svg>
                    }
                    @case ('json') {
                      <svg viewBox="0 0 32 32"><path d="M11 5 C7 5 7 8 7 11 C7 14 5 15 4 16 C5 17 7 18 7 21 C7 24 7 27 11 27" /><path d="M21 5 C25 5 25 8 25 11 C25 14 27 15 28 16 C27 17 25 18 25 21 C25 24 25 27 21 27" /></svg>
                    }
                  }
                </span>
                <span class="s2-no">0{{ i + 1 }}</span>
                <h3>{{ f.title }}</h3>
                <p>{{ f.text }}</p>
              </div></div>
            </li>
          }
        </ol>
      </section>

      <!-- How it works: four huge words on hairlines ------------------------------------------------------------>
      <section id="flow" class="s2-section">
        <header class="s2-head reveal">
          <span class="sc-eyebrow">How it works</span>
          <h2>Four steps, the same every time.</h2>
        </header>
        <ol class="s2-steps">
          @for (s of steps; track s.title; let i = $index) {
            <li class="reveal" [style.--i]="i">
              <span class="s2-no">0{{ i + 1 }}</span>
              <strong>{{ s.title }}</strong>
              <p>{{ s.text }}</p>
            </li>
          }
        </ol>
      </section>

      <!-- Templates: pick a pill, read its description ---------------------------------------------------------->
      <section id="templates" class="s2-section">
        <header class="s2-head reveal">
          <span class="sc-eyebrow">Task templates</span>
          <h2>Start from a task that already passes.</h2>
          <p class="s2-lead">All {{ templates.length }} templates are valid as soon as they are created, and a test
            checks this. Pick one from any <code>+</code> in the outline or the diagram.</p>
        </header>
        <div class="s2-templates reveal">
          <div class="s2-pills" role="group" aria-label="Task templates">
            @for (t of templates; track t.id) {
              <button type="button" [class.active]="picked().id === t.id" [attr.aria-pressed]="picked().id === t.id"
                      [attr.aria-controls]="'s2-template-detail'" (click)="pickedId.set(t.id)">{{ t.name }}</button>
            }
          </div>
          <div class="s2-shell s2-template-detail"><div class="s2-core" id="s2-template-detail" aria-live="polite">
            <span class="s2-no">{{ picked().id }}</span>
            <h3>{{ picked().name }}</h3>
            <p>{{ picked().description }}</p>
          </div></div>
        </div>
      </section>

      <!-- Closing call to action ------------------------------------------------------------------------------->
      <section class="s2-section s2-final reveal">
        <span class="sc-eyebrow">Get started</span>
        <h2>Open a sample, break it, and watch the checks catch it.</h2>
        <div class="sc-ctas center">
          <a class="sc-btn" routerLink="/orchestrator">
            Orchestrator editor<span class="sc-btn-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 11 L11 5 M6 5 H11 V10" /></svg></span>
          </a>
          <a class="sc-btn sc-btn-ghost" routerLink="/workflow">
            Workflow editor<span class="sc-btn-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 11 L11 5 M6 5 H11 V10" /></svg></span>
          </a>
        </div>
      </section>

      <footer class="sc-footer">
        <span>Flow Configurator edits, validates, publishes and monitors process-orchestrator configurations.</span>
        <a routerLink="/settings">Connection settings</a>
      </footer>
    </main>
  `,
})
export class Overview extends ShowcasePage {
  protected readonly templates = TASK_TEMPLATES;
  protected readonly steps = STEPS;
  protected readonly features = FEATURES;
  protected readonly pickedId = signal(TASK_TEMPLATES[0].id);
  protected readonly picked = computed(() => TASK_TEMPLATES.find(t => t.id === this.pickedId()) ?? TASK_TEMPLATES[0]);
}
