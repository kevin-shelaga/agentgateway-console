import { describe, expect, it } from "vitest";
import {
  aiProviders,
  findConfigIssues,
  policyBreakdown,
  protocolDistribution,
  type ClusterSnapshot,
} from "./insights";
import type { K8sResource } from "./types";

function res(
  kind: string,
  name: string,
  namespace: string | undefined,
  spec: Record<string, unknown>,
): K8sResource {
  return { apiVersion: "x/v1", kind, metadata: { name, namespace }, spec };
}

function snap(partial: Partial<ClusterSnapshot>): ClusterSnapshot {
  return {
    gateways: [],
    httproutes: [],
    grpcroutes: [],
    backends: [],
    policies: [],
    gatewayclasses: [],
    ...partial,
  };
}

const gw = res("Gateway", "gw", "infra", {
  gatewayClassName: "agentgateway",
  listeners: [
    { name: "http", protocol: "HTTP", port: 80 },
    { name: "https", protocol: "HTTPS", port: 443 },
  ],
});
const gwClass = res("GatewayClass", "agentgateway", undefined, {
  controllerName: "agentgateway.dev/agentgateway",
});

describe("findConfigIssues", () => {
  it("flags routes whose parent gateway does not exist", () => {
    const route = res("HTTPRoute", "r", "apps", {
      parentRefs: [{ name: "missing-gw", namespace: "infra" }],
      rules: [],
    });
    const issues = findConfigIssues(snap({ httproutes: [route], gateways: [gw] }));
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("missing-gw"))).toBe(
      true,
    );
  });

  it("flags routes referencing missing AgentgatewayBackends but not missing Services", () => {
    const route = res("HTTPRoute", "r", "infra", {
      parentRefs: [{ name: "gw" }],
      rules: [
        {
          backendRefs: [
            { name: "missing-be", group: "agentgateway.dev", kind: "AgentgatewayBackend" },
            { name: "some-svc", port: 80 }, // Service: not resolvable from snapshot, skipped
          ],
        },
      ],
    });
    const issues = findConfigIssues(snap({ httproutes: [route], gateways: [gw] }));
    expect(issues.some((i) => i.message.includes("missing-be"))).toBe(true);
    expect(issues.some((i) => i.message.includes("some-svc"))).toBe(false);
  });

  it("flags gateways with a missing class and gateways with no routes", () => {
    const lonely = res("Gateway", "lonely", "infra", { gatewayClassName: "nope", listeners: [] });
    const issues = findConfigIssues(snap({ gateways: [lonely], gatewayclasses: [gwClass] }));
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("nope"))).toBe(true);
    expect(
      issues.some((i) => i.severity === "info" && i.message.includes("no routes attached")),
    ).toBe(true);
  });

  it("flags orphaned backends and unresolved policy targets", () => {
    const backend = res("AgentgatewayBackend", "orphan", "apps", {
      static: { host: "x", port: 1 },
    });
    const policy = res("AgentgatewayPolicy", "pol", "apps", {
      targetRefs: [{ kind: "Gateway", name: "ghost", group: "gateway.networking.k8s.io" }],
      traffic: {},
    });
    const issues = findConfigIssues(snap({ backends: [backend], policies: [policy] }));
    expect(issues.some((i) => i.message.includes("not referenced by any route"))).toBe(true);
    expect(issues.some((i) => i.message.includes("ghost"))).toBe(true);
  });

  it("is clean for a fully wired setup", () => {
    const backend = res("AgentgatewayBackend", "be", "infra", { static: { host: "x", port: 1 } });
    const route = res("HTTPRoute", "r", "infra", {
      parentRefs: [{ name: "gw" }],
      rules: [
        { backendRefs: [{ name: "be", group: "agentgateway.dev", kind: "AgentgatewayBackend" }] },
      ],
    });
    const issues = findConfigIssues(
      snap({ gateways: [gw], gatewayclasses: [gwClass], httproutes: [route], backends: [backend] }),
    );
    expect(issues).toEqual([]);
  });
});

describe("protocolDistribution", () => {
  it("counts listeners by protocol across the fleet", () => {
    const gw2 = res("Gateway", "gw2", "infra", {
      listeners: [{ name: "http", protocol: "HTTP", port: 8080 }],
    });
    expect(protocolDistribution([gw, gw2])).toEqual([
      { protocol: "HTTP", count: 2 },
      { protocol: "HTTPS", count: 1 },
    ]);
  });
});

describe("policyBreakdown", () => {
  it("counts by configured section and by target kind", () => {
    const p1 = res("AgentgatewayPolicy", "p1", "a", {
      targetRefs: [{ kind: "Gateway", name: "g" }],
      traffic: {},
      frontend: {},
    });
    const p2 = res("AgentgatewayPolicy", "p2", "a", {
      targetRefs: [{ kind: "HTTPRoute", name: "r" }, { kind: "Gateway", name: "g2" }],
      backend: {},
    });
    const breakdown = policyBreakdown([p1, p2]);
    expect(breakdown.sections).toEqual([
      { section: "traffic", count: 1 },
      { section: "frontend", count: 1 },
      { section: "backend", count: 1 },
    ]);
    expect(breakdown.targets).toEqual([
      { kind: "Gateway", count: 2 },
      { kind: "HTTPRoute", count: 1 },
    ]);
  });
});

describe("aiProviders", () => {
  it("groups AI backends by provider with models", () => {
    const b1 = res("AgentgatewayBackend", "b1", "a", {
      ai: { provider: { openai: { model: "gpt-4o-mini" } } },
    });
    const b2 = res("AgentgatewayBackend", "b2", "a", {
      ai: { provider: { openai: { model: "gpt-4.1" } } },
    });
    const b3 = res("AgentgatewayBackend", "b3", "a", {
      ai: { provider: { anthropic: { model: "claude-sonnet-4-5" } } },
    });
    const nonAi = res("AgentgatewayBackend", "b4", "a", { static: { host: "h", port: 1 } });
    expect(aiProviders([b1, b2, b3, nonAi])).toEqual([
      { provider: "openai", count: 2, models: ["gpt-4.1", "gpt-4o-mini"] },
      { provider: "anthropic", count: 1, models: ["claude-sonnet-4-5"] },
    ]);
  });
});
