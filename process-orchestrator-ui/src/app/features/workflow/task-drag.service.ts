import { Injectable, signal } from '@angular/core';
import { JsonPath, pathToString } from '../../core/json-path';

export type DropPlace = 'before' | 'after' | 'into';

/**
 * Drag state shared by every (nested) task-flow of one workflow diagram: which task is being dragged and where it
 * would land. Provided by the workflow editor, so each editor has its own.
 */
@Injectable()
export class TaskDragService {
  readonly from = signal<JsonPath | null>(null);
  readonly over = signal<{ key: string; place: DropPlace } | null>(null);

  readonly fromKey = () => {
    const from = this.from();
    return from ? pathToString(from) : null;
  };

  /** A task cannot be dropped into itself or into one of its own branches. */
  accepts(list: JsonPath): boolean {
    const from = this.from();
    return !!from && !(list.length >= from.length && from.every((p, i) => list[i] === p));
  }

  reset(): void {
    this.from.set(null);
    this.over.set(null);
  }
}
