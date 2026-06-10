import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateway, secretList } from "@/test/fixtures";

vi.mock("@/lib/k8s/client", () => ({
  getObjectClient: vi.fn(),
  asKubernetesObject: (x: unknown) => x,
}));

import { getObjectClient } from "@/lib/k8s/client";
import { GET, POST } from "./route";

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

function params(group: string, version: string, plural: string) {
  return { params: Promise.resolve({ group, version, plural }) };
}

function listRequest(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "x-kube-context": "test-ctx" },
  });
}

describe("GET /api/resources/[group]/[version]/[plural]", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    mockedGetObjectClient.mockReturnValue(client as never);
  });

  it("lists an allowlisted kind, scoping to the requested namespace", async () => {
    client.list.mockResolvedValue({ items: [gateway] });

    const res = await GET(
      listRequest(
        "/api/resources/gateway.networking.k8s.io/v1/gateways?namespace=agentgateway-system",
      ),
      params("gateway.networking.k8s.io", "v1", "gateways"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([gateway]);
    expect(client.list).toHaveBeenCalledWith(
      "gateway.networking.k8s.io/v1",
      "Gateway",
      "agentgateway-system",
    );
    expect(mockedGetObjectClient).toHaveBeenCalledWith("test-ctx");
  });

  it("strips data/stringData from listed secrets", async () => {
    const secretWithData = {
      ...secretList[0],
      data: { apiKey: "c2VjcmV0" },
      stringData: { other: "plaintext" },
    };
    client.list.mockResolvedValue({ items: [secretWithData] });

    const res = await GET(
      listRequest("/api/resources/core/v1/secrets?namespace=agents"),
      params("core", "v1", "secrets"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].metadata.name).toBe("openai-key");
    expect(body.items[0].data).toBeUndefined();
    expect(body.items[0].stringData).toBeUndefined();
    expect(client.list).toHaveBeenCalledWith("v1", "Secret", "agents");
  });

  it("rejects an unknown GVK with 403 without touching the cluster", async () => {
    const res = await GET(
      listRequest("/api/resources/apps/v1/deployments"),
      params("apps", "v1", "deployments"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.reason).toBe("Forbidden");
    expect(body.error.message).toContain("apps/v1/deployments");
    expect(mockedGetObjectClient).not.toHaveBeenCalled();
  });

  it("passes through a parsed k8s error status", async () => {
    client.list.mockRejectedValue({
      code: 404,
      body: JSON.stringify({
        kind: "Status",
        code: 404,
        reason: "NotFound",
        message: "the server could not find the requested resource",
      }),
    });

    const res = await GET(
      listRequest("/api/resources/gateway.networking.k8s.io/v1/gateways"),
      params("gateway.networking.k8s.io", "v1", "gateways"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatchObject({
      status: 404,
      reason: "NotFound",
      message: "the server could not find the requested resource",
    });
  });
});

describe("POST /api/resources/[group]/[version]/[plural]", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    mockedGetObjectClient.mockReturnValue(client as never);
  });

  function postRequest(path: string, body: unknown) {
    return new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { "x-kube-context": "test-ctx" },
      body: JSON.stringify(body),
    });
  }

  it("rejects a manifest whose kind/apiVersion does not match the URL", async () => {
    const res = await POST(
      postRequest("/api/resources/gateway.networking.k8s.io/v1/httproutes", gateway),
      params("gateway.networking.k8s.io", "v1", "httproutes"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("expected gateway.networking.k8s.io/v1/HTTPRoute");
    expect(client.create).not.toHaveBeenCalled();
  });

  it("rejects creation of read-only kinds", async () => {
    const res = await POST(
      postRequest("/api/resources/core/v1/namespaces", {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: { name: "new-ns" },
      }),
      params("core", "v1", "namespaces"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("read-only");
    expect(client.create).not.toHaveBeenCalled();
  });

  it("creates a valid manifest and returns 201", async () => {
    const created = { ...gateway, metadata: { ...gateway.metadata, uid: "abc-123" } };
    client.create.mockResolvedValue(created);

    const res = await POST(
      postRequest("/api/resources/gateway.networking.k8s.io/v1/gateways", gateway),
      params("gateway.networking.k8s.io", "v1", "gateways"),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledWith(gateway);
  });
});
