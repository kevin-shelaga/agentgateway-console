import { describe, expect, it } from "vitest";
import {
  ALL_RESOURCES,
  ENTERPRISE_RESOURCES,
  backendDetail,
  backendType,
  getResource,
  getResourceByKind,
  READONLY_RESOURCES,
  RESOURCES,
} from "./registry";
import { apiVersionOf } from "./types";
import { aiBackend, gateway, httpRoute, mcpBackend, policy, staticBackend } from "@/test/fixtures";
import type { K8sResource } from "./types";

describe("registry shape", () => {
  it("manages the eleven OSS kinds, four enterprise kinds, plus three read-only", () => {
    expect(RESOURCES.map((r) => r.kind).sort()).toEqual([
      "AgentgatewayBackend",
      "AgentgatewayParameters",
      "AgentgatewayPolicy",
      "BackendTLSPolicy",
      "GRPCRoute",
      "Gateway",
      "GatewayClass",
      "HTTPRoute",
      "ListenerSet",
      "ReferenceGrant",
      "TLSRoute",
    ]);
    expect(ENTERPRISE_RESOURCES.map((r) => r.kind).sort()).toEqual([
      "EnterpriseAgentgatewayBackend",
      "EnterpriseAgentgatewayParameters",
      "EnterpriseAgentgatewayPolicy",
      "EnterpriseListenerSet",
    ]);
    expect(READONLY_RESOURCES.every((r) => r.readOnly)).toBe(true);
    expect(ALL_RESOURCES).toHaveLength(18);
  });

  it("every descriptor has a unique id and a valid template", () => {
    const ids = new Set(ALL_RESOURCES.map((r) => r.id));
    expect(ids.size).toBe(ALL_RESOURCES.length);
    for (const desc of RESOURCES) {
      const template = desc.template("default");
      expect(template.kind).toBe(desc.kind);
      expect(template.apiVersion).toBe(apiVersionOf(desc));
      expect(template.metadata.name).toBeTruthy();
      if (desc.scope === "Namespaced") {
        expect(template.metadata.namespace).toBe("default");
      }
    }
  });

  it("lookups work by id and kind", () => {
    expect(getResource("backends")?.kind).toBe("AgentgatewayBackend");
    expect(getResourceByKind("Gateway")?.id).toBe("gateways");
    expect(getResource("nope")).toBeUndefined();
  });
});

describe("list columns", () => {
  function col(id: string, columnId: string, res: K8sResource) {
    const desc = getResource(id)!;
    return desc.listColumns.find((c) => c.id === columnId)!.accessor(res);
  }

  it("gateway columns: class, listeners, address", () => {
    expect(col("gateways", "class", gateway)).toBe("agentgateway");
    expect(col("gateways", "listeners", gateway)).toEqual(["HTTP:80", "HTTPS:443"]);
    expect(col("gateways", "address", gateway)).toBe("4.229.185.215");
    expect(col("gateways", "address", { ...gateway, status: {} })).toBeUndefined();
  });

  it("httproute columns: hostnames, parents, rules", () => {
    expect(col("httproutes", "hostnames", httpRoute)).toEqual(["chat.example.com"]);
    expect(col("httproutes", "parents", httpRoute)).toEqual(["api-agentgateway"]);
    expect(col("httproutes", "rules", httpRoute)).toBe("1");
  });

  it("policy columns: targets and sections", () => {
    expect(col("policies", "targets", policy)).toEqual(["Gateway/api-agentgateway"]);
    expect(col("policies", "sections", policy)).toEqual(["traffic"]);
  });
});

describe("backendType / backendDetail", () => {
  it("classifies each backend flavor", () => {
    expect(backendType(aiBackend)).toBe("ai");
    expect(backendType(mcpBackend)).toBe("mcp");
    expect(backendType(staticBackend)).toBe("static");
    expect(backendType({ ...aiBackend, spec: {} })).toBe("unknown");
  });

  it("summarizes details per flavor", () => {
    expect(backendDetail(aiBackend)).toBe("openai · gpt-4o-mini");
    expect(backendDetail(mcpBackend)).toBe("1 target(s)");
    expect(backendDetail(staticBackend)).toBe("example.com:443");
    expect(
      backendDetail({
        ...aiBackend,
        spec: { ai: { groups: [{ providers: [] }] } },
      }),
    ).toBe("1 priority group(s)");
    expect(
      backendDetail({ ...aiBackend, spec: { aws: { agentCore: { agentRuntimeArn: "arn" } } } }),
    ).toBe("agentCore");
  });
});
