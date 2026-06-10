export type Path = Array<string | number>;

export function getAtPath(obj: unknown, path: Path): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/** Immutable set: clones along the path, creating objects/arrays as needed. */
export function setAtPath<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const isIndex = typeof head === "number";
  const base: Record<string | number, unknown> = Array.isArray(obj)
    ? ([...obj] as unknown as Record<string | number, unknown>)
    : obj && typeof obj === "object"
      ? { ...(obj as Record<string | number, unknown>) }
      : isIndex
        ? ([] as unknown as Record<string | number, unknown>)
        : {};
  base[head] = setAtPath(base[head], rest, value);
  return base as T;
}

/** Immutable delete of the leaf key; removes empty parent objects is NOT done (explicitness). */
export function deleteAtPath<T>(obj: T, path: Path): T {
  if (path.length === 0) return obj;
  if (path.length === 1) {
    if (Array.isArray(obj)) {
      const copy = [...obj];
      copy.splice(path[0] as number, 1);
      return copy as unknown as T;
    }
    if (obj && typeof obj === "object") {
      const { [path[0]]: _removed, ...rest } = obj as Record<string | number, unknown>;
      return rest as T;
    }
    return obj;
  }
  const [head, ...rest] = path;
  const child = getAtPath(obj, [head]);
  if (child === undefined) return obj;
  return setAtPath(obj, [head], deleteAtPath(child, rest));
}
