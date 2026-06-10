import { NextRequest } from "next/server";
import type { V1Secret } from "@kubernetes/client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/k8s/client", () => ({
  getCoreClient: vi.fn(),
}));

import { getCoreClient } from "@/lib/k8s/client";
import { GET, POST } from "./route";

const mockedGetCoreClient = vi.mocked(getCoreClient);

function makeSecret(opts: {
  name: string;
  namespace?: string;
  type?: string;
  data?: Record<string, string>;
  labels?: Record<string, string>;
  creationTimestamp?: string;
}): V1Secret {
  return {
    metadata: {
      name: opts.name,
      namespace: opts.namespace ?? "agents",
      labels: opts.labels,
      creationTimestamp: opts.creationTimestamp
        ? (new Date(opts.creationTimestamp) as never)
        : undefined,
    },
    type: opts.type ?? "Opaque",
    data: opts.data,
  } as V1Secret;
}

function listRequest(namespace?: string) {
  const qs = namespace ? `?namespace=${namespace}` : "";
  return new NextRequest(`http://localhost/api/llm-keys${qs}`, {
    headers: { "x-kube-context": "test-ctx" },
  });
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/llm-keys", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-kube-context": "test-ctx" },
  });
}

describe("GET /api/llm-keys", () => {
  const listSecretForAllNamespaces = vi.fn();
  const listNamespacedSecret = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCoreClient.mockReturnValue({
      listSecretForAllNamespaces,
      listNamespacedSecret,
    } as never);
  });

  it("lists Opaque secrets with an Authorization key or the console label, metadata only", async () => {
    listSecretForAllNamespaces.mockResolvedValue({
      items: [
        makeSecret({
          name: "openai-key",
          data: { Authorization: "c2stc2VjcmV0" },
          labels: {
            "agentgateway.dev/managed-by": "console",
            "agentgateway.dev/provider": "openai",
          },
          creationTimestamp: "2026-06-01T00:00:00Z",
        }),
        // External key: has Authorization but no console label.
        makeSecret({ name: "byo-key", data: { Authorization: "eA==" } }),
        // Labeled but key entry renamed — still listed (managed).
        makeSecret({
          name: "weird-key",
          data: { token: "eA==" },
          labels: { "agentgateway.dev/managed-by": "console" },
        }),
        // Noise: unrelated Opaque secret and a TLS secret.
        makeSecret({ name: "random-config", data: { config: "eA==" } }),
        makeSecret({
          name: "tls-cert",
          type: "kubernetes.io/tls",
          data: { Authorization: "eA==" },
        }),
      ],
    });

    const res = await GET(listRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { name: string }) => i.name)).toEqual([
      "openai-key",
      "byo-key",
      "weird-key",
    ]);
    expect(body.items[0]).toEqual({
      name: "openai-key",
      namespace: "agents",
      creationTimestamp: "2026-06-01T00:00:00.000Z",
      labels: {
        "agentgateway.dev/managed-by": "console",
        "agentgateway.dev/provider": "openai",
      },
      managed: true,
    });
    expect(body.items[1].managed).toBe(false);
    // Secret payloads never cross the wire.
    for (const item of body.items) {
      expect(item).not.toHaveProperty("data");
      expect(item).not.toHaveProperty("stringData");
    }
    expect(JSON.stringify(body)).not.toContain("c2stc2VjcmV0");
  });

  it("scopes to a namespace when ?namespace= is given", async () => {
    listNamespacedSecret.mockResolvedValue({
      items: [makeSecret({ name: "openai-key", namespace: "agents", data: { Authorization: "eA==" } })],
    });

    const res = await GET(listRequest("agents"));

    expect(res.status).toBe(200);
    expect(listNamespacedSecret).toHaveBeenCalledWith({ namespace: "agents" });
    expect(listSecretForAllNamespaces).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  it("returns a parsed error response when listing fails", async () => {
    listSecretForAllNamespaces.mockRejectedValue({
      code: 401,
      body: JSON.stringify({ kind: "Status", code: 401, reason: "Unauthorized", message: "nope" }),
    });

    const res = await GET(listRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatchObject({ status: 401, reason: "Unauthorized", message: "nope" });
  });
});

describe("POST /api/llm-keys", () => {
  const createNamespacedSecret = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCoreClient.mockReturnValue({ createNamespacedSecret } as never);
  });

  it("creates an Opaque secret with the Authorization entry and console labels", async () => {
    createNamespacedSecret.mockImplementation(({ body }: { body: V1Secret }) =>
      Promise.resolve({
        ...body,
        metadata: { ...body.metadata, creationTimestamp: new Date("2026-06-10T00:00:00Z") },
      }),
    );

    const res = await POST(
      postRequest({
        name: "anthropic-key",
        namespace: "agents",
        apiKey: "sk-ant-secret",
        providerHint: "anthropic",
      }),
    );

    expect(res.status).toBe(201);
    expect(createNamespacedSecret).toHaveBeenCalledWith({
      namespace: "agents",
      body: {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: "anthropic-key",
          namespace: "agents",
          labels: {
            "agentgateway.dev/managed-by": "console",
            "agentgateway.dev/provider": "anthropic",
          },
        },
        type: "Opaque",
        stringData: { Authorization: "sk-ant-secret" },
      },
    });
    const body = await res.json();
    expect(body).toMatchObject({ name: "anthropic-key", namespace: "agents", managed: true });
    // The key is never echoed back.
    expect(JSON.stringify(body)).not.toContain("sk-ant-secret");
  });

  it("omits the provider label when no hint is given", async () => {
    createNamespacedSecret.mockImplementation(({ body }: { body: V1Secret }) =>
      Promise.resolve(body),
    );

    const res = await POST(postRequest({ name: "k", namespace: "agents", apiKey: "v" }));

    expect(res.status).toBe(201);
    const sent = createNamespacedSecret.mock.calls[0][0].body as V1Secret;
    expect(sent.metadata?.labels).toEqual({ "agentgateway.dev/managed-by": "console" });
  });

  it.each([
    [{ namespace: "agents", apiKey: "v" }, "name"],
    [{ name: "k", apiKey: "v" }, "namespace"],
    [{ name: "k", namespace: "agents" }, "apiKey"],
    [{ name: "k", namespace: "agents", apiKey: "   " }, "apiKey"],
  ])("rejects invalid input %#", async (body, field) => {
    const res = await POST(postRequest(body));

    expect(res.status).toBe(403);
    const parsed = await res.json();
    expect(parsed.error.message).toContain(field);
    expect(createNamespacedSecret).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/llm-keys", { method: "POST", body: "not json" }),
    );

    expect(res.status).toBe(403);
    expect(createNamespacedSecret).not.toHaveBeenCalled();
  });

  it("returns a parsed error response when creation fails", async () => {
    createNamespacedSecret.mockRejectedValue({
      code: 409,
      body: JSON.stringify({
        kind: "Status",
        code: 409,
        reason: "AlreadyExists",
        message: "secrets \"k\" already exists",
      }),
    });

    const res = await POST(postRequest({ name: "k", namespace: "agents", apiKey: "v" }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.reason).toBe("AlreadyExists");
  });
});
