import { getResourceByKind } from "./registry";
import type { K8sResource } from "./types";

export interface ResourceRef {
  kind: string;
  name: string;
  namespace?: string;
  /** Registry id when the target kind is managed by the console (linkable). */
  descId?: string;
  /** Relationship label, e.g. "parent gateway", "backend". */
  relation: string;
}

function ref(
  kind: string,
  name: string,
  relation: string,
  namespace?: string,
): ResourceRef {
  return { kind, name, namespace, relation, descId: getResourceByKind(kind)?.id };
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

/** Outgoing references a resource declares in its spec. */
export function getReferences(res: K8sResource): ResourceRef[] {
  const spec = (res.spec ?? {}) as Record<string, unknown>;
  const ns = res.metadata.namespace;
  const out: ResourceRef[] = [];

  switch (res.kind) {
    case "HTTPRoute":
    case "GRPCRoute": {
      for (const p of asArray(spec.parentRefs)) {
        out.push(
          ref((p.kind as string) ?? "Gateway", p.name as string, "parent", (p.namespace as string) ?? ns),
        );
      }
      for (const rule of asArray(spec.rules)) {
        for (const b of asArray(rule.backendRefs)) {
          const kind = (b.kind as string) ?? "Service";
          out.push(ref(kind, b.name as string, "backend", (b.namespace as string) ?? ns));
        }
      }
      break;
    }
    case "Gateway": {
      if (typeof spec.gatewayClassName === "string") {
        out.push(ref("GatewayClass", spec.gatewayClassName, "class"));
      }
      for (const l of asArray(spec.listeners)) {
        const tls = l.tls as Record<string, unknown> | undefined;
        for (const c of asArray(tls?.certificateRefs)) {
          out.push(ref("Secret", c.name as string, `tls cert (${l.name})`, (c.namespace as string) ?? ns));
        }
      }
      break;
    }
    case "ListenerSet": {
      const parent = spec.parentRef as Record<string, unknown> | undefined;
      if (parent?.name) {
        out.push(
          ref(
            (parent.kind as string) ?? "Gateway",
            parent.name as string,
            "parent",
            (parent.namespace as string) ?? ns,
          ),
        );
      }
      break;
    }
    case "GatewayClass": {
      const p = spec.parametersRef as Record<string, unknown> | undefined;
      if (p?.name) {
        out.push(ref((p.kind as string) ?? "AgentgatewayParameters", p.name as string, "parameters", p.namespace as string));
      }
      break;
    }
    case "AgentgatewayPolicy": {
      for (const t of asArray(spec.targetRefs)) {
        out.push(ref(t.kind as string, t.name as string, "target", ns));
      }
      break;
    }
  }

  return out.filter((r) => r.kind && r.name);
}

/**
 * Incoming references: which of the given resources point at `target`.
 * Used to show "attached routes" on a Gateway, "policies" on a target, etc.
 */
export function getIncomingRefs(
  target: K8sResource,
  candidates: K8sResource[],
): Array<{ source: K8sResource; relation: string }> {
  const results: Array<{ source: K8sResource; relation: string }> = [];
  for (const candidate of candidates) {
    for (const r of getReferences(candidate)) {
      if (
        r.kind === target.kind &&
        r.name === target.metadata.name &&
        (r.namespace === undefined ||
          target.metadata.namespace === undefined ||
          r.namespace === target.metadata.namespace)
      ) {
        results.push({ source: candidate, relation: r.relation });
      }
    }
  }
  return results;
}
