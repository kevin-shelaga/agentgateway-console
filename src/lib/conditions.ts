import type { K8sCondition, K8sResource, ScopedCondition, StatusSummary } from "./types";

/** Condition types where status=True indicates a problem. */
const NEGATIVE_POLARITY = new Set(["Conflicted", "Degraded", "OverlappingTLSConfig"]);

function asConditions(value: unknown): K8sCondition[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is K8sCondition => !!c && typeof c === "object" && "type" in c && "status" in c,
  );
}

/**
 * Flattens every condition a resource reports: top-level `status.conditions`,
 * Gateway `status.listeners[].conditions`, and route `status.parents[].conditions`.
 */
export function extractConditions(res: K8sResource): ScopedCondition[] {
  const status = (res.status ?? {}) as Record<string, unknown>;
  const out: ScopedCondition[] = [...asConditions(status.conditions)];

  if (Array.isArray(status.listeners)) {
    for (const listener of status.listeners as Array<Record<string, unknown>>) {
      const name = typeof listener?.name === "string" ? listener.name : "?";
      for (const c of asConditions(listener?.conditions)) {
        out.push({ ...c, scope: `listener/${name}` });
      }
    }
  }

  if (Array.isArray(status.parents)) {
    for (const parent of status.parents as Array<Record<string, unknown>>) {
      const ref = (parent?.parentRef ?? {}) as Record<string, unknown>;
      const name =
        [ref.namespace, ref.name].filter((p) => typeof p === "string").join("/") || "?";
      for (const c of asConditions(parent?.conditions)) {
        out.push({ ...c, scope: `parent/${name}` });
      }
    }
  }

  return out;
}

function isFailing(c: ScopedCondition): boolean {
  return NEGATIVE_POLARITY.has(c.type) ? c.status === "True" : c.status === "False";
}

function describe(c: ScopedCondition): string {
  const base = c.message || `${c.type} is ${c.status}`;
  return c.scope ? `${base} (${c.scope})` : base;
}

export function summarizeStatus(res: K8sResource): StatusSummary {
  const conditions = extractConditions(res);
  if (conditions.length === 0) {
    return { state: "Unknown", message: "No status reported", conditions };
  }

  const failing = conditions.filter(isFailing);
  if (failing.length > 0) {
    return { state: "Degraded", message: describe(failing[0]), conditions };
  }

  const pending = conditions.filter((c) => c.status === "Unknown");
  if (pending.length > 0) {
    return { state: "Pending", message: describe(pending[0]), conditions };
  }

  return { state: "Healthy", message: "All conditions healthy", conditions };
}
