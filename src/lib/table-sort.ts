import type { ColumnDef, K8sResource, ResourceDescriptor } from "./types";

/** Built-in sort keys plus any kind-specific column id. */
export type SortKey = "name" | "namespace" | "age" | "status" | string;

export interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}

/** Pseudo column id for the status facet (real columns never start with __). */
export const STATUS_FILTER_KEY = "__status";

/** Health states ordered worst-first so "asc" surfaces problems. */
const STATE_ORDER: Record<string, number> = {
  Degraded: 0,
  Pending: 1,
  Unknown: 2,
  Healthy: 3,
};

export function columnText(value: string | string[] | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value.join(", ") : value;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function findColumn(desc: ResourceDescriptor, id: string): ColumnDef | undefined {
  return desc.listColumns.find((c) => c.id === id);
}

export function sortResources(
  items: K8sResource[],
  desc: ResourceDescriptor,
  sort: SortState | null,
): K8sResource[] {
  if (!sort) return items;
  const { key, direction } = sort;
  const sign = direction === "asc" ? 1 : -1;

  const valueOf = (res: K8sResource): string | number => {
    switch (key) {
      case "name":
        return res.metadata.name;
      case "namespace":
        return res.metadata.namespace ?? "";
      case "age":
        return new Date(res.metadata.creationTimestamp ?? 0).getTime();
      case "status":
        return STATE_ORDER[desc.getStatus(res).state] ?? 9;
      default: {
        const column = findColumn(desc, key);
        return column ? columnText(column.accessor(res)) : "";
      }
    }
  };

  return [...items].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : collator.compare(String(va), String(vb));
    // Stable tiebreak so equal values keep a deterministic order.
    return sign * cmp || collator.compare(a.metadata.name, b.metadata.name);
  });
}

export interface Facet {
  value: string;
  count: number;
}

/** Distinct cell values for a column (arrays contribute each entry). */
export function columnFacets(items: K8sResource[], column: ColumnDef): Facet[] {
  const counts = new Map<string, number>();
  for (const res of items) {
    const raw = column.accessor(res);
    const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value === "") continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.value, b.value));
}

export type ColumnFilters = Record<string, Set<string>>;

/** AND across columns, OR within a column's selected values. */
export function applyColumnFilters(
  items: K8sResource[],
  desc: ResourceDescriptor,
  filters: ColumnFilters,
): K8sResource[] {
  const active = Object.entries(filters).filter(([, values]) => values.size > 0);
  if (active.length === 0) return items;

  return items.filter((res) =>
    active.every(([columnId, selected]) => {
      if (columnId === STATUS_FILTER_KEY) {
        return selected.has(desc.getStatus(res).state);
      }
      const column = findColumn(desc, columnId);
      if (!column) return true;
      const raw = column.accessor(res);
      const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
      return values.some((v) => selected.has(v));
    }),
  );
}
