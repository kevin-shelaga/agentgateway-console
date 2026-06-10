import { describe, expect, it } from "vitest";
import { getIncomingRefs, getReferences } from "./references";
import { aiBackend, gateway, gatewayClass, httpRoute, policy } from "@/test/fixtures";
import type { K8sResource } from "./types";

describe("getReferences", () => {
  it("HTTPRoute: parents and backends, namespace defaulting to the route's", () => {
    const refs = getReferences(httpRoute);
    expect(refs).toContainEqual(
      expect.objectContaining({
        kind: "Gateway",
        name: "api-agentgateway",
        namespace: "agentgateway-system",
        relation: "parent",
      }),
    );
    expect(refs).toContainEqual(
      expect.objectContaining({
        kind: "AgentgatewayBackend",
        name: "openai-backend",
        namespace: "agents",
        relation: "backend",
        descId: "backends",
      }),
    );
  });

  it("Gateway: class and listener TLS certificate secrets", () => {
    const refs = getReferences(gateway);
    expect(refs).toContainEqual(
      expect.objectContaining({ kind: "GatewayClass", name: "agentgateway", relation: "class" }),
    );
    expect(refs).toContainEqual(
      expect.objectContaining({
        kind: "Secret",
        name: "api-cert",
        relation: "tls cert (https)",
        namespace: "agentgateway-system",
      }),
    );
  });

  it("GatewayClass: parametersRef", () => {
    const withParams: K8sResource = {
      ...gatewayClass,
      spec: {
        ...gatewayClass.spec,
        parametersRef: {
          group: "agentgateway.dev",
          kind: "AgentgatewayParameters",
          name: "params",
          namespace: "agentgateway-system",
        },
      },
    };
    expect(getReferences(withParams)).toContainEqual(
      expect.objectContaining({ kind: "AgentgatewayParameters", name: "params" }),
    );
    expect(getReferences(gatewayClass)).toEqual([]);
  });

  it("Policy: targetRefs; unknown kinds get no descId", () => {
    const refs = getReferences(policy);
    expect(refs).toContainEqual(
      expect.objectContaining({ kind: "Gateway", name: "api-agentgateway", relation: "target" }),
    );
  });

  it("returns nothing for kinds without outgoing refs", () => {
    expect(getReferences(aiBackend)).toEqual([]);
  });
});

describe("getIncomingRefs", () => {
  it("finds routes attaching to a gateway", () => {
    const incoming = getIncomingRefs(gateway, [httpRoute, policy, aiBackend]);
    expect(incoming).toHaveLength(2); // route parent + policy target
    expect(incoming.map((i) => i.source.metadata.name).sort()).toEqual([
      "chat-route",
      "cors-policy",
    ]);
  });

  it("matches namespace when both sides declare one", () => {
    const otherNsGateway: K8sResource = {
      ...gateway,
      metadata: { ...gateway.metadata, namespace: "elsewhere" },
    };
    expect(getIncomingRefs(otherNsGateway, [httpRoute])).toEqual([]);
  });
});
