import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateway, gatewayClass, secretList } from "@/test/fixtures";

vi.mock("@/lib/k8s/client", () => ({
  getObjectClient: vi.fn(),
  asKubernetesObject: (x: unknown) => x,
}));

import { getObjectClient } from "@/lib/k8s/client";
import { DELETE, GET, PUT } from "./route";

const mockedGetObjectClient = vi.mocked(getObjectClient);

function mockClient() {
  return {
    list: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    replace: vi.fn(),
    delete: vi.fn(),
  };
}

function params(
  group: string,
  version: string,
  plural: string,
  namespace: string,
  name: string,
) {
  return { params: Promise.resolve({ group, version, plural, namespace, name }) };
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "x-kube-context": "test-ctx" },
    ...init,
  });
}

let client: ReturnType<typeof mockClient>;

beforeEach(() => {
  vi.clearAllMocks();
  client = mockClient();
  mockedGetObjectClient.mockReturnValue(client as never);
});

describe("GET item", () => {
  it("reads a namespaced resource by reference", async () => {
    client.read.mockResolvedValue(gateway);

    const res = await GET(
      request(
        "/api/resources/gateway.networking.k8s.io/v1/gateways/agentgateway-system/api-agentgateway",
      ),
      params(
        "gateway.networking.k8s.io",
        "v1",
        "gateways",
        "agentgateway-system",
        "api-agentgateway",
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(gateway);
    expect(client.read).toHaveBeenCalledWith({
      apiVersion: "gateway.networking.k8s.io/v1",
      kind: "Gateway",
      metadata: { name: "api-agentgateway", namespace: "agentgateway-system" },
    });
  });

  it("omits the namespace from the read ref for _cluster-scoped gatewayclasses", async () => {
    client.read.mockResolvedValue(gatewayClass);

    const res = await GET(
      request(
        "/api/resources/gateway.networking.k8s.io/v1/gatewayclasses/_cluster/agentgateway",
      ),
      params("gateway.networking.k8s.io", "v1", "gatewayclasses", "_cluster", "agentgateway"),
    );

    expect(res.status).toBe(200);
    expect(client.read).toHaveBeenCalledWith({
      apiVersion: "gateway.networking.k8s.io/v1",
      kind: "GatewayClass",
      metadata: { name: "agentgateway" },
    });
    const ref = client.read.mock.calls[0][0];
    expect("namespace" in ref.metadata).toBe(false);
  });

  it("strips data/stringData when reading a secret", async () => {
    client.read.mockResolvedValue({
      ...secretList[0],
      data: { apiKey: "c2VjcmV0" },
      stringData: { other: "x" },
    });

    const res = await GET(
      request("/api/resources/core/v1/secrets/agents/openai-key"),
      params("core", "v1", "secrets", "agents", "openai-key"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata.name).toBe("openai-key");
    expect(body.data).toBeUndefined();
    expect(body.stringData).toBeUndefined();
  });

  it("rejects unknown GVKs with 403", async () => {
    const res = await GET(
      request("/api/resources/apps/v1/deployments/ns/x"),
      params("apps", "v1", "deployments", "ns", "x"),
    );
    expect(res.status).toBe(403);
    expect(client.read).not.toHaveBeenCalled();
  });
});

describe("PUT item", () => {
  it("rejects a manifest whose name does not match the URL", async () => {
    const res = await PUT(
      request(
        "/api/resources/gateway.networking.k8s.io/v1/gateways/agentgateway-system/other-name",
        { method: "PUT", body: JSON.stringify(gateway) },
      ),
      params("gateway.networking.k8s.io", "v1", "gateways", "agentgateway-system", "other-name"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain('"api-agentgateway"');
    expect(body.error.message).toContain('"other-name"');
    expect(client.replace).not.toHaveBeenCalled();
  });

  it("replaces the resource when names match", async () => {
    const updated = { ...gateway, metadata: { ...gateway.metadata, resourceVersion: "2" } };
    client.replace.mockResolvedValue(updated);

    const res = await PUT(
      request(
        "/api/resources/gateway.networking.k8s.io/v1/gateways/agentgateway-system/api-agentgateway",
        { method: "PUT", body: JSON.stringify(gateway) },
      ),
      params(
        "gateway.networking.k8s.io",
        "v1",
        "gateways",
        "agentgateway-system",
        "api-agentgateway",
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(client.replace).toHaveBeenCalledWith(gateway);
  });

  it("rejects updates to read-only kinds", async () => {
    const res = await PUT(
      request("/api/resources/core/v1/secrets/agents/openai-key", {
        method: "PUT",
        body: JSON.stringify(secretList[0]),
      }),
      params("core", "v1", "secrets", "agents", "openai-key"),
    );
    expect(res.status).toBe(403);
    expect(client.replace).not.toHaveBeenCalled();
  });
});

describe("DELETE item", () => {
  it("rejects deletion of read-only kinds", async () => {
    const res = await DELETE(
      request("/api/resources/core/v1/namespaces/_cluster/default", { method: "DELETE" }),
      params("core", "v1", "namespaces", "_cluster", "default"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("read-only");
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("deletes by reference and returns the status", async () => {
    client.delete.mockResolvedValue({ kind: "Status", status: "Success" });

    const res = await DELETE(
      request("/api/resources/agentgateway.dev/v1alpha1/agentgatewaybackends/agents/openai-backend", {
        method: "DELETE",
      }),
      params("agentgateway.dev", "v1alpha1", "agentgatewaybackends", "agents", "openai-backend"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "Success" });
    expect(client.delete).toHaveBeenCalledWith({
      apiVersion: "agentgateway.dev/v1alpha1",
      kind: "AgentgatewayBackend",
      metadata: { name: "openai-backend", namespace: "agents" },
    });
  });
});
