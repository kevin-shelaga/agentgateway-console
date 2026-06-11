import { describe, expect, it } from "vitest";
import { defaultModel, resolveLlmEndpoints, suggestMcpUrl } from "./llm-endpoints";
import { aiBackend, gateway, httpRoute } from "@/test/fixtures";
import type { K8sResource } from "./types";

describe("resolveLlmEndpoints", () => {
  it("walks backend ← route ← gateway → address/listener into URLs", () => {
    const endpoints = resolveLlmEndpoints(aiBackend, [httpRoute], [gateway]);
    expect(endpoints).toHaveLength(2); // one per listener (HTTP:80, HTTPS:443)
    expect(endpoints[0]).toMatchObject({
      url: "http://4.229.185.215",
      hostname: "chat.example.com",
      gateway: "agentgateway-system/api-agentgateway",
      route: "agents/chat-route",
      pathPrefix: "/",
    });
    expect(endpoints[1].url).toBe("https://4.229.185.215");
  });

  it("omits default ports but keeps custom ones", () => {
    const customGw: K8sResource = JSON.parse(JSON.stringify(gateway));
    (customGw.spec!.listeners as Array<Record<string, unknown>>)[0].port = 8080;
    const endpoints = resolveLlmEndpoints(aiBackend, [httpRoute], [customGw]);
    expect(endpoints[0].url).toBe("http://4.229.185.215:8080");
  });

  it("returns nothing when no route references the backend", () => {
    expect(resolveLlmEndpoints(aiBackend, [], [gateway])).toEqual([]);
  });

  it("falls back to the API-server service proxy when the gateway has no address", () => {
    const noAddr: K8sResource = { ...gateway, status: {} };
    const endpoints = resolveLlmEndpoints(aiBackend, [httpRoute], [noAddr]);
    // HTTP listener only — the proxy hop terminates TLS, HTTPS listeners are skipped.
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toMatchObject({
      url: "svc://agentgateway-system/api-agentgateway:80",
      viaApiServer: true,
      gateway: "agentgateway-system/api-agentgateway",
    });
  });

  it("skips non-HTTP listeners", () => {
    const tcpGw: K8sResource = JSON.parse(JSON.stringify(gateway));
    tcpGw.spec!.listeners = [{ name: "tcp", protocol: "TCP", port: 9000 }];
    expect(resolveLlmEndpoints(aiBackend, [httpRoute], [tcpGw])).toEqual([]);
  });
});

describe("suggestMcpUrl", () => {
  it("appends /mcp to the normalized path prefix", () => {
    const [endpoint] = resolveLlmEndpoints(aiBackend, [httpRoute], [gateway]);
    expect(suggestMcpUrl(endpoint)).toBe("http://4.229.185.215/mcp");
    expect(suggestMcpUrl({ ...endpoint, pathPrefix: "/agents/" })).toBe(
      "http://4.229.185.215/agents/mcp",
    );
  });
});

describe("defaultModel", () => {
  it("reads the provider model from the backend spec", () => {
    expect(defaultModel(aiBackend)).toBe("gpt-4o-mini");
  });
  it("returns empty for non-AI or model-less backends", () => {
    expect(defaultModel({ ...aiBackend, spec: { static: { host: "h", port: 1 } } })).toBe("");
    expect(defaultModel({ ...aiBackend, spec: { ai: { provider: { openai: {} } } } })).toBe("");
  });
});

describe("enterprise backends", () => {
  it("resolves endpoints for routes referencing EnterpriseAgentgatewayBackend", () => {
    const entBackend: K8sResource = {
      apiVersion: "enterpriseagentgateway.solo.io/v1alpha1",
      kind: "EnterpriseAgentgatewayBackend",
      metadata: { name: "ent-ai", namespace: "agents" },
      spec: { ai: { provider: { anthropic: { model: "claude-sonnet-4-5" } } } },
    };
    const route: K8sResource = JSON.parse(JSON.stringify(httpRoute));
    (route.spec!.rules as Array<Record<string, unknown>>)[0].backendRefs = [
      { name: "ent-ai", group: "enterpriseagentgateway.solo.io", kind: "EnterpriseAgentgatewayBackend" },
    ];
    const endpoints = resolveLlmEndpoints(entBackend, [route], [gateway]);
    expect(endpoints.length).toBeGreaterThan(0);
    expect(defaultModel(entBackend)).toBe("claude-sonnet-4-5");
  });
});
