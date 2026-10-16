/**
 * Undo / redo over immutable documents. Every edit hands in the document as it was before the edit; undo swaps the
 * current document for the last one kept.
 *
 * Edits that carry the same `group` (a field path) and follow each other within `mergeMs` count as one step, so
 * typing a label is undone in one go rather than one key at a time.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastGroup: string | null = null;
  private lastAt = 0;

  constructor(
    private readonly limit = 200,
    private readonly mergeMs = 1000,
  ) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Call before replacing `before` with a new document. */
  record(before: T, group: string | null = null, now = Date.now()): void {
    const merges = group !== null && group === this.lastGroup && now - this.lastAt < this.mergeMs && this.past.length > 0;
    if (!merges) {
      this.past.push(before);
      if (this.past.length > this.limit) {
        this.past.shift();
      }
    }
    this.future = [];
    this.lastGroup = group;
    this.lastAt = now;
  }

  /** The document to show instead of `current`, or `null` when there is nothing to undo. */
  undo(current: T): T | null {
    const previous = this.past.pop();
    if (previous === undefined) {
      return null;
    }
    this.future.push(current);
    this.lastGroup = null;
    return previous;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) {
      return null;
    }
    this.past.push(current);
    this.lastGroup = null;
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.lastGroup = null;
  }
}
