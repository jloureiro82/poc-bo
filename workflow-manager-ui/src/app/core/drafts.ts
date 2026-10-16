import { ConfigKind } from './model';

/** The document currently open in each editor, kept in localStorage so a reload does not lose work. */

const key = (kind: ConfigKind) => `wm-ui.draft.${kind}`;

export function loadDraft<T>(kind: ConfigKind): T | null {
  try {
    const raw = localStorage.getItem(key(kind));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(kind: ConfigKind, value: unknown): void {
  try {
    localStorage.setItem(key(kind), JSON.stringify(value));
  } catch {
    // storage unavailable: the draft only lives in memory
  }
}

/**
 * Earlier drafts. When the editor's document is replaced (New, Sample, Import, opening a stored version or a run's
 * definition, opening another saved draft), the document it held is kept here first, so switching never loses work.
 * Newest first; a document identical to one already kept is not kept twice.
 */
export interface SavedDraft {
  id: string;
  name: string;
  savedAt: string;
  body: unknown;
}

export const MAX_SAVED_DRAFTS = 20;

const savedKey = (kind: ConfigKind) => `wm-ui.drafts.${kind}`;

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
  const name = body && typeof body === 'object' && typeof (body as Record<string, unknown>)['name'] === 'string' ? (body as Record<string, string>)['name'] : '';
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

/** Hand-off from the library page to an editor ("open this stored version"). */
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
 * Accepts what people paste: a bare definition, a full create request (`{ workflowConfiguration, configurationDetails }`),
 * or a stored version as the deployment endpoints return it (the definition as JSON text in `payload`).
 */
export function unwrapImported(_kind: ConfigKind, parsed: unknown): unknown {
  if (parsed && typeof parsed === 'object') {
    const doc = parsed as Record<string, unknown>;
    if ('workflowConfiguration' in doc) {
      return doc['workflowConfiguration'];
    }
    if (typeof doc['payload'] === 'string' && 'entityName' in doc) {
      return JSON.parse(doc['payload']);
    }
  }
  return parsed;
}
