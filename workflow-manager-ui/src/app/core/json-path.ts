/** A location inside a JSON document, e.g. `['stepList', 0, 'activityList', 1]`. */
export type JsonPath = (string | number)[];

/** Renders a path as `stepList[0].activityList[1]`; the empty path is the document root (`''`). */
export function pathToString(path: JsonPath): string {
  let out = '';
  for (const part of path) {
    out += typeof part === 'number' ? `[${part}]` : out ? `.${part}` : part;
  }
  return out;
}

export function getAt(root: unknown, path: JsonPath): unknown {
  let node: unknown = root;
  for (const part of path) {
    if (node == null || typeof node !== 'object') {
      return undefined;
    }
    node = (node as Record<string | number, unknown>)[part];
  }
  return node;
}

/**
 * Returns a copy of `root` with the value at `path` replaced. `undefined` removes the key (or array slot).
 * Only the objects along the path are copied.
 */
export function setAt<T>(root: T, path: JsonPath, value: unknown): T {
  if (path.length === 0) {
    return value as T;
  }
  const [head, ...rest] = path;
  const container: any = Array.isArray(root) ? [...root] : { ...(isObject(root) ? root : {}) };
  const next = setAt(container[head], rest, value);
  if (next === undefined && rest.length === 0) {
    if (Array.isArray(container)) {
      container.splice(head as number, 1);
    } else {
      delete container[head];
    }
  } else {
    container[head] = next;
  }
  return container;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

/** Inverse of {@link pathToString}: `tasks[0].cases[1]` -> `['tasks', 0, 'cases', 1]`. */
export function parsePath(path: string): JsonPath {
  const parts: JsonPath = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) {
    parts.push(m[2] != null ? Number(m[2]) : m[1]);
  }
  return parts;
}
