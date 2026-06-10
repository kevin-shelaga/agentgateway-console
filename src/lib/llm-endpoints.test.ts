import { describe, expect, it } from "vitest";
import { defaultModel, resolveLlmEndpoints } from "./llm-endpoints";
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

  it("returns nothing when no route references the backend or gateway has no address", () => {
    expect(resolveLlmEndpoints(aiBackend, [], [gateway])).toEqual([]);
    const noAddr: K8sResource = { ...gateway, status: {} };
    expect(resolveLlmEndpoints(aiBackend, [httpRoute], [noAddr])).toEqual([]);
  });

  it("skips non-HTTP listeners", () => {
    const tcpGw: K8sResource = JSON.parse(JSON.stringify(gateway));
    tcpGw.spec!.listeners = [{ name: "tcp", protocol: "TCP", port: 9000 }];
    expect(resolveLlmEndpoints(aiBackend, [httpRoute], [tcpGw])).toEqual([]);
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
