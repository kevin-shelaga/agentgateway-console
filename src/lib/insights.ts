import { getReferences } from "./references";
import type { K8sResource } from "./types";

export interface ClusterSnapshot {
  gateways: K8sResource[];
  httproutes: K8sResource[];
  grpcroutes: K8sResource[];
  backends: K8sResource[];
  policies: K8sResource[];
  gatewayclasses: K8sResource[];
}

export interface ConfigIssue {
  severity: "warning" | "info";
  message: string;
  /** Resource the issue is about (deep-link target). */
  kind: string;
  name: string;
  namespace?: string;
  descId: string;
}

function key(kind: string, namespace: string | undefined, name: string): string {
  return `${kind}|${namespace ?? ""}|${name}`;
}

/**
 * Cross-resource completeness checks the apiserver and controllers don't
 * report: dangling references produce no status conditions (a route whose
 * Gateway doesn't exist simply never gets parent status), and orphans are
 * not errors at all — but both usually mean a half-finished setup.
 */
export function findConfigIssues(snap: ClusterSnapshot): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  const gatewayKeys = new Set(
    snap.gateways.map((g) => key("Gateway", g.metadata.namespace, g.metadata.name)),
  );
  const backendKeys = new Set(
    snap.backends.map((b) => key("AgentgatewayBackend", b.metadata.namespace, b.metadata.name)),
  );
  const classNames = new Set(snap.gatewayclasses.map((c) => c.metadata.name));
  const routeKeys = new Set(
    [...snap.httproutes, ...snap.grpcroutes].map((r) =>
      key(r.kind, r.metadata.namespace, r.metadata.name),
    ),
  );

  const referencedGateways = new Set<string>();
  const referencedBackends = new Set<string>();

  for (const route of [...snap.httproutes, ...snap.grpcroutes]) {
    for (const ref of getReferences(route)) {
      const refKey = key(ref.kind, ref.namespace, ref.name);
      if (ref.kind === "Gateway") {
        referencedGateways.add(refKey);
        if (!gatewayKeys.has(refKey)) {
          issues.push({
            severity: "warning",
            message: `references missing Gateway ${ref.namespace ?? ""}/${ref.name}`,
            kind: route.kind,
            name: route.metadata.name,
            namespace: route.metadata.namespace,
            descId: route.kind === "GRPCRoute" ? "grpcroutes" : "httproutes",
          });
        }
      } else if (ref.kind === "AgentgatewayBackend") {
        referencedBackends.add(refKey);
        if (!backendKeys.has(refKey)) {
          issues.push({
            severity: "warning",
            message: `references missing Backend ${ref.namespace ?? ""}/${ref.name}`,
            kind: route.kind,
            name: route.metadata.name,
            namespace: route.metadata.namespace,
            descId: route.kind === "GRPCRoute" ? "grpcroutes" : "httproutes",
          });
        }
      }
      // Services and Secrets are not in the snapshot; controllers report
      // unresolved Service refs via ResolvedRefs conditions already.
    }
  }

  for (const gateway of snap.gateways) {
    const className = (gateway.spec as Record<string, unknown> | undefined)?.gatewayClassName;
    if (snap.gatewayclasses.length > 0 && typeof className === "string" && !classNames.has(className)) {
      issues.push({
        severity: "warning",
        message: `gatewayClassName "${className}" does not match any GatewayClass`,
        kind: "Gateway",
        name: gateway.metadata.name,
        namespace: gateway.metadata.namespace,
        descId: "gateways",
      });
    }
    if (!referencedGateways.has(key("Gateway", gateway.metadata.namespace, gateway.metadata.name))) {
      issues.push({
        severity: "info",
        message: "no routes attached to this gateway",
        kind: "Gateway",
        name: gateway.metadata.name,
        namespace: gateway.metadata.namespace,
        descId: "gateways",
      });
    }
  }

  for (const backend of snap.backends) {
    if (
      !referencedBackends.has(
        key("AgentgatewayBackend", backend.metadata.namespace, backend.metadata.name),
      )
    ) {
      issues.push({
        severity: "info",
        message: "not referenced by any route",
        kind: "AgentgatewayBackend",
        name: backend.metadata.name,
        namespace: backend.metadata.namespace,
        descId: "backends",
      });
    }
  }

  const resolvable: Record<string, Set<string>> = {
    Gateway: gatewayKeys,
    AgentgatewayBackend: backendKeys,
    HTTPRoute: routeKeys,
    GRPCRoute: routeKeys,
  };
  for (const policy of snap.policies) {
    for (const ref of getReferences(policy)) {
      const pool = resolvable[ref.kind];
      if (pool && !pool.has(key(ref.kind, ref.namespace, ref.name))) {
        issues.push({
          severity: "warning",
          message: `targets missing ${ref.kind} ${ref.namespace ?? ""}/${ref.name}`,
          kind: "AgentgatewayPolicy",
          name: policy.metadata.name,
          namespace: policy.metadata.namespace,
          descId: "policies",
        });
      }
    }
  }

  return issues;
}

export function protocolDistribution(
  gateways: K8sResource[],
): Array<{ protocol: string; count: number }> {
  const counts = new Map<string, number>();
  for (const gateway of gateways) {
    const listeners = (gateway.spec as Record<string, unknown> | undefined)?.listeners;
    if (!Array.isArray(listeners)) continue;
    for (const listener of listeners) {
      const protocol = (listener as Record<string, unknown>)?.protocol;
      if (typeof protocol !== "string") continue;
      counts.set(protocol, (counts.get(protocol) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([protocol, count]) => ({ protocol, count }))
    .sort((a, b) => b.count - a.count || a.protocol.localeCompare(b.protocol));
}

export function policyBreakdown(policies: K8sResource[]): {
  sections: Array<{ section: string; count: number }>;
  targets: Array<{ kind: string; count: number }>;
} {
  const sections = new Map<string, number>();
  const targets = new Map<string, number>();
  for (const policy of policies) {
    const spec = (policy.spec ?? {}) as Record<string, unknown>;
    for (const section of ["traffic", "frontend", "backend"]) {
      if (spec[section] !== undefined) {
        sections.set(section, (sections.get(section) ?? 0) + 1);
      }
    }
    if (Array.isArray(spec.targetRefs)) {
      for (const ref of spec.targetRefs) {
        const kind = (ref as Record<string, unknown>)?.kind;
        if (typeof kind !== "string") continue;
        targets.set(kind, (targets.get(kind) ?? 0) + 1);
      }
    }
  }
  const order = ["traffic", "frontend", "backend"];
  return {
    sections: order
      .filter((s) => sections.has(s))
      .map((section) => ({ section, count: sections.get(section)! })),
    targets: [...targets.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
  };
}

export function aiProviders(
  backends: K8sResource[],
): Array<{ provider: string; count: number; models: string[] }> {
  const byProvider = new Map<string, { count: number; models: Set<string> }>();
  for (const backend of backends) {
    const ai = (backend.spec as Record<string, unknown> | undefined)?.ai as
      | Record<string, unknown>
      | undefined;
    if (!ai) continue;
    const provider = (ai.provider ?? {}) as Record<string, unknown>;
    const name = Object.keys(provider).find((k) =>
      ["openai", "azureopenai", "azure", "anthropic", "gemini", "vertexai", "bedrock", "custom"].includes(k),
    );
    if (!name) continue;
    const entry = byProvider.get(name) ?? { count: 0, models: new Set<string>() };
    entry.count += 1;
    const model = (provider[name] as Record<string, unknown> | undefined)?.model;
    if (typeof model === "string") entry.models.add(model);
    byProvider.set(name, entry);
  }
  return [...byProvider.entries()]
    .map(([provider, { count, models }]) => ({ provider, count, models: [...models].sort() }))
    .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider));
}
