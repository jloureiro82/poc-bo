import { sameValue } from './diff';

/**
 * The documents open in an editor, one per tab. Pure functions over an immutable state: the editor keeps the state in
 * a signal, and drafts.ts stores it so a reload reopens the same tabs. Shared with process-orchestrator-ui.
 */
export interface EditorTab<T = unknown> {
  id: string;
  body: T;
  /** The document as it was opened or last published: the tab shows it is edited while `body` differs from it. */
  base: T;
}

export interface TabsState<T = unknown> {
  tabs: EditorTab<T>[];
  /** id of the tab shown in the editor; always one of `tabs` */
  active: string;
}

export function newTabId(now = new Date()): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function singleTab<T>(body: T, id = newTabId()): TabsState<T> {
  return { tabs: [{ id, body, base: body }], active: id };
}

/** Whether a tab holds changes since it was opened or last published. */
export function isEdited<T>(tab: EditorTab<T>): boolean {
  return tab.body !== tab.base && !sameValue(tab.body, tab.base);
}

/** After publishing the shown tab: its document is the new base, so it no longer shows as edited. */
export function markPublished<T>(state: TabsState<T>): TabsState<T> {
  const current = activeTab(state);
  return { ...state, tabs: state.tabs.map(t => (t.id === current.id ? { ...t, base: t.body } : t)) };
}

export function activeTab<T>(state: TabsState<T>): EditorTab<T> {
  return state.tabs.find(t => t.id === state.active) ?? state.tabs[0];
}

/**
 * Opens `body` in a new tab right after the active one and shows it. With `reuse`, a tab that already holds the same
 * document is shown instead (opening a stored version twice gives one tab).
 */
export function openTab<T>(state: TabsState<T>, body: T, options: { reuse?: boolean; id?: string } = {}): TabsState<T> {
  if (options.reuse) {
    const same = state.tabs.find(t => sameValue(t.body, body));
    if (same) {
      return { ...state, active: same.id };
    }
  }
  const id = options.id ?? newTabId();
  const at = state.tabs.findIndex(t => t.id === state.active) + 1;
  const tabs = [...state.tabs.slice(0, at), { id, body, base: body }, ...state.tabs.slice(at)];
  return { tabs, active: id };
}

/**
 * Closes a tab. When it was the one shown, its right-hand neighbour is shown (or the left one when it was last).
 * Closing the only tab leaves one tab holding `starter()`, so the editor always has a document.
 */
export function closeTab<T>(state: TabsState<T>, id: string, starter: () => T): TabsState<T> {
  const index = state.tabs.findIndex(t => t.id === id);
  if (index < 0) {
    return state;
  }
  const tabs = state.tabs.filter(t => t.id !== id);
  if (tabs.length === 0) {
    return singleTab(starter());
  }
  const active = state.active === id ? tabs[Math.min(index, tabs.length - 1)].id : state.active;
  return { tabs, active };
}

/** Shows another open tab. */
export function selectTab<T>(state: TabsState<T>, id: string): TabsState<T> {
  return state.tabs.some(t => t.id === id) ? { ...state, active: id } : state;
}

/** Puts the edited document into the active tab. Returns the same state when nothing changed. */
export function updateActive<T>(state: TabsState<T>, body: T): TabsState<T> {
  const current = activeTab(state);
  if (current.body === body) {
    return state;
  }
  return { ...state, tabs: state.tabs.map(t => (t.id === current.id ? { ...t, body } : t)) };
}

/**
 * Accepts a stored state only when it is well formed: at least one tab, unique ids, an active id among them. A tab
 * stored without a base (saved before tabs had one) takes its document as the base.
 */
export function validTabs<T>(value: unknown): TabsState<T> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const { tabs, active } = value as { tabs?: unknown; active?: unknown };
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return null;
  }
  const ok = tabs.every(t => t && typeof t === 'object' && typeof t.id === 'string' && t.body && typeof t.body === 'object');
  const ids = new Set(tabs.map(t => (t as EditorTab).id));
  if (!ok || ids.size !== tabs.length) {
    return null;
  }
  const first = (tabs[0] as EditorTab).id;
  const withBase = (tabs as EditorTab<T>[]).map(t => (t.base && typeof t.base === 'object' ? t : { ...t, base: t.body }));
  return { tabs: withBase, active: typeof active === 'string' && ids.has(active) ? active : first };
}
