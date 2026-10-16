import { TabsState, singleTab, validTabs } from './editor-tabs';
import { ConfigKind } from './model';

/** The tabs open in each editor, kept in localStorage so a reload reopens them. */

const tabsKey = (kind: ConfigKind) => `po-ui.tabs.${kind}`;
/** Before tabs, each editor kept one document here. It becomes the first tab, once. */
const oldDraftKey = (kind: ConfigKind) => `po-ui.draft.${kind}`;

export function loadTabs<T>(kind: ConfigKind, starter: () => T): TabsState<T> {
  try {
    const stored = validTabs<T>(JSON.parse(localStorage.getItem(tabsKey(kind)) ?? 'null'));
    if (stored) {
      return stored;
    }
    const old = JSON.parse(localStorage.getItem(oldDraftKey(kind)) ?? 'null');
    if (old && typeof old === 'object') {
      return singleTab(old as T);
    }
  } catch {
    // unreadable storage: start fresh
  }
  return singleTab(starter());
}

export function saveTabs(kind: ConfigKind, state: TabsState): void {
  try {
    localStorage.setItem(tabsKey(kind), JSON.stringify(state));
    localStorage.removeItem(oldDraftKey(kind));
  } catch {
    // storage unavailable or full: the tabs only live in memory
  }
}

/**
 * Closed tabs. A closed tab's document is kept here, so closing never loses work; the editor's "Closed tabs" menu
 * reopens it. Newest first; a document identical to one already kept is not kept twice. (Before tabs, this list held
 * the documents an editor replaced, so those appear here too.)
 */
export interface SavedDraft {
  id: string;
  name: string;
  savedAt: string;
  body: unknown;
}

export const MAX_SAVED_DRAFTS = 20;

const savedKey = (kind: ConfigKind) => `po-ui.drafts.${kind}`;

export function listSavedDrafts(kind: ConfigKind): SavedDraft[] {
  try {
    const list = JSON.parse(localStorage.getItem(savedKey(kind)) ?? '[]');
    return Array.isArray(list) ? list.filter(d => d && typeof d.id === 'string') : [];
  } catch {
    return [];
  }
}

/** Keeps `body` in the list (moving an identical copy to the top). Returns the new list. */
export function keepDraft(kind: ConfigKind, body: unknown, now = new Date()): SavedDraft[] {
  const text = JSON.stringify(body);
  const rest = listSavedDrafts(kind).filter(d => JSON.stringify(d.body) !== text);
  const label = body && typeof body === 'object' ? (body as Record<string, unknown>)['label'] : undefined;
  const name = typeof label === 'string' ? label : '';
  const entry: SavedDraft = { id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, savedAt: now.toISOString(), body };
  return writeSaved(kind, [entry, ...rest].slice(0, MAX_SAVED_DRAFTS));
}

export function forgetDraft(kind: ConfigKind, id: string): SavedDraft[] {
  return writeSaved(kind, listSavedDrafts(kind).filter(d => d.id !== id));
}

function writeSaved(kind: ConfigKind, list: SavedDraft[]): SavedDraft[] {
  try {
    localStorage.setItem(savedKey(kind), JSON.stringify(list));
  } catch {
    // storage full or unavailable: the list stays as it was
    return listSavedDrafts(kind);
  }
  return list;
}

/** Hand-off from the library page to an editor ("open this stored version"): the editor opens it in a new tab. */
let pending: { kind: ConfigKind; body: unknown; note?: string } | null = null;

export function queueOpen(kind: ConfigKind, body: unknown, note?: string): void {
  pending = { kind, body, note };
}

/** Takes the queued document for this editor, if any, with an optional message to show once it is open. */
export function takeQueuedOpen<T>(kind: ConfigKind): { body: T; note?: string } | null {
  if (pending?.kind !== kind) {
    return null;
  }
  const taken = { body: structuredClone(pending.body) as T, note: pending.note };
  pending = null;
  return taken;
}

/**
 * Accepts what people paste: either a bare definition, or a full create request
 * (`{ workflowConfiguration | orchestratorConfiguration, configurationDetails }`).
 */
export function unwrapImported(kind: ConfigKind, parsed: unknown): unknown {
  const bodyKey = kind === 'workflow' ? 'workflowConfiguration' : 'orchestratorConfiguration';
  if (parsed && typeof parsed === 'object' && bodyKey in parsed) {
    return (parsed as Record<string, unknown>)[bodyKey];
  }
  return parsed;
}
