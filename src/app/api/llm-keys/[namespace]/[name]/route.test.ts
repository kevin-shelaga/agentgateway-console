import { NextRequest } from "next/server";
import type { V1Secret } from "@kubernetes/client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/k8s/client", () => ({
  getCoreClient: vi.fn(),
}));

import { getCoreClient } from "@/lib/k8s/client";
import { DELETE, PUT } from "./route";

const mockedGetCoreClient = vi.mocked(getCoreClient);

const params = (namespace: string, name: string) => ({
  params: Promise.resolve({ namespace, name }),
});

function putRequest(body: unknown) {
  return new NextRequest("http://localhost/api/llm-keys/agents/openai-key", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "x-kube-context": "test-ctx" },
  });
}

function deleteRequest() {
  return new NextRequest("http://localhost/api/llm-keys/agents/openai-key", {
    method: "DELETE",
    headers: { "x-kube-context": "test-ctx" },
  });
}

const managedSecret: V1Secret = {
  metadata: {
    name: "openai-key",
    namespace: "agents",
    resourceVersion: "42",
    labels: { "agentgateway.dev/managed-by": "console", "agentgateway.dev/provider": "openai" },
    annotations: { "example.com/note": "keep" },
  },
  type: "Opaque",
  data: { Authorization: "b2xkLWtleQ==" },
} as V1Secret;

describe("PUT /api/llm-keys/[namespace]/[name]", () => {
  const readNamespacedSecret = vi.fn();
  const replaceNamespacedSecret = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCoreClient.mockReturnValue({ readNamespacedSecret, replaceNamespacedSecret } as never);
  });

  it("rotates the key, replacing data while preserving labels and annotations", async () => {
    readNamespacedSecret.mockResolvedValue(managedSecret);
    replaceNamespacedSecret.mockImplementation(({ body }: { body: V1Secret }) =>
      Promise.resolve(body),
    );

    const res = await PUT(putRequest({ apiKey: "sk-new-secret" }), params("agents", "openai-key"));

    expect(res.status).toBe(200);
    expect(readNamespacedSecret).toHaveBeenCalledWith({ name: "openai-key", namespace: "agents" });
    expect(replaceNamespacedSecret).toHaveBeenCalledWith({
      name: "openai-key",
      namespace: "agents",
      body: {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: "openai-key",
          namespace: "agents",
          labels: managedSecret.metadata!.labels,
          annotations: managedSecret.metadata!.annotations,
          resourceVersion: "42",
        },
        type: "Opaque",
        stringData: { Authorization: "sk-new-secret" },
      },
    });
    // Old data is dropped entirely — stringData fully replaces it.
    const sent = replaceNamespacedSecret.mock.calls[0][0].body as V1Secret;
    expect(sent.data).toBeUndefined();

    const body = await res.json();
    expect(body).toMatchObject({ name: "openai-key", namespace: "agents", managed: true });
    expect(JSON.stringify(body)).not.toContain("sk-new-secret");
    expect(body).not.toHaveProperty("stringData");
    expect(body).not.toHaveProperty("data");
  });

  it("rotates an unmanaged secret that carries an Authorization entry", async () => {
    readNamespacedSecret.mockResolvedValue({
      metadata: { name: "byo-key", namespace: "agents", resourceVersion: "7" },
      type: "Opaque",
      data: { Authorization: "eA==" },
    } as V1Secret);
    replaceNamespacedSecret.mockImplementation(({ body }: { body: V1Secret }) =>
      Promise.resolve(body),
    );

    const res = await PUT(putRequest({ apiKey: "sk-new" }), params("agents", "byo-key"));

    expect(res.status).toBe(200);
    expect(replaceNamespacedSecret).toHaveBeenCalled();
  });

  it("refuses to rotate a secret with neither the console label nor an Authorization entry", async () => {
    readNamespacedSecret.mockResolvedValue({
      metadata: { name: "random", namespace: "agents" },
      type: "Opaque",
      data: { config: "eA==" },
    } as V1Secret);

    const res = await PUT(putRequest({ apiKey: "sk-new" }), params("agents", "random"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("not an LLM API key");
    expect(replaceNamespacedSecret).not.toHaveBeenCalled();
  });

  it("rejects an empty apiKey without touching the cluster", async () => {
    const res = await PUT(putRequest({ apiKey: "  " }), params("agents", "openai-key"));

    expect(res.status).toBe(403);
    expect(readNamespacedSecret).not.toHaveBeenCalled();
    expect(replaceNamespacedSecret).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body", async () => {
    const res = await PUT(putRequest("not json"), params("agents", "openai-key"));

    expect(res.status).toBe(403);
    expect(readNamespacedSecret).not.toHaveBeenCalled();
  });

  it("returns a parsed error when the secret does not exist", async () => {
    readNamespacedSecret.mockRejectedValue({
      code: 404,
      body: JSON.stringify({ kind: "Status", code: 404, reason: "NotFound", message: "gone" }),
    });

    const res = await PUT(putRequest({ apiKey: "sk-new" }), params("agents", "openai-key"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.reason).toBe("NotFound");
  });
});

describe("DELETE /api/llm-keys/[namespace]/[name]", () => {
  const readNamespacedSecret = vi.fn();
  const deleteNamespacedSecret = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCoreClient.mockReturnValue({ readNamespacedSecret, deleteNamespacedSecret } as never);
  });

  it("deletes a console-managed secret", async () => {
    readNamespacedSecret.mockResolvedValue(managedSecret);
    deleteNamespacedSecret.mockResolvedValue({});

    const res = await DELETE(deleteRequest(), params("agents", "openai-key"));

    expect(res.status).toBe(200);
    expect(deleteNamespacedSecret).toHaveBeenCalledWith({ name: "openai-key", namespace: "agents" });
    expect(await res.json()).toEqual({ deleted: true });
  });

  it("refuses to delete a secret the console does not manage", async () => {
    readNamespacedSecret.mockResolvedValue({
      metadata: { name: "byo-key", namespace: "agents" },
      type: "Opaque",
      data: { Authorization: "eA==" },
    } as V1Secret);

    const res = await DELETE(deleteRequest(), params("agents", "byo-key"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("not managed by this console");
    expect(deleteNamespacedSecret).not.toHaveBeenCalled();
  });

  it("returns a parsed error when deletion fails", async () => {
    readNamespacedSecret.mockResolvedValue(managedSecret);
    deleteNamespacedSecret.mockRejectedValue({
      code: 403,
      body: JSON.stringify({ kind: "Status", code: 403, reason: "Forbidden", message: "rbac" }),
    });

    const res = await DELETE(deleteRequest(), params("agents", "openai-key"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("rbac");
  });
});
