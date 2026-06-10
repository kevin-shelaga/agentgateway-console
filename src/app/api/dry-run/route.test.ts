import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateway } from "@/test/fixtures";

vi.mock("@/lib/k8s/client", () => ({
  getObjectClient: vi.fn(),
  asKubernetesObject: (x: unknown) => x,
}));

import { getObjectClient } from "@/lib/k8s/client";
import { POST } from "./route";

const mockedGetObjectClient = vi.mocked(getObjectClient);

function mockClient() {
  return { create: vi.fn(), replace: vi.fn() };
}

function postRequest(body: BodyInit) {
  return new NextRequest("http://localhost/api/dry-run", {
    method: "POST",
    headers: { "x-kube-context": "test-ctx" },
    body,
  });
}

describe("POST /api/dry-run", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    mockedGetObjectClient.mockReturnValue(client as never);
  });

  it("rejects a non-JSON body with 403", async () => {
    const res = await POST(postRequest("not json at all"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("must be JSON");
    expect(client.create).not.toHaveBeenCalled();
    expect(client.replace).not.toHaveBeenCalled();
  });

  it("rejects kinds outside the writable allowlist", async () => {
    const res = await POST(
      postRequest(
        JSON.stringify({
          manifest: { apiVersion: "v1", kind: "Namespace", metadata: { name: "x" } },
          mode: "create",
        }),
      ),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("dry-run not supported for v1/Namespace");
    expect(client.create).not.toHaveBeenCalled();
  });

  it("dry-run creates with dryRun=All in create mode", async () => {
    client.create.mockResolvedValue(gateway);

    const res = await POST(postRequest(JSON.stringify({ manifest: gateway, mode: "create" })));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(client.create).toHaveBeenCalledWith(gateway, undefined, "All");
    expect(client.replace).not.toHaveBeenCalled();
  });

  it("dry-run replaces with dryRun=All in update mode", async () => {
    client.replace.mockResolvedValue(gateway);

    const res = await POST(postRequest(JSON.stringify({ manifest: gateway, mode: "update" })));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(client.replace).toHaveBeenCalledWith(gateway, undefined, "All");
    expect(client.create).not.toHaveBeenCalled();
  });

  it("surfaces apiserver validation failures with parsed causes", async () => {
    client.create.mockRejectedValue({
      code: 422,
      body: JSON.stringify({
        kind: "Status",
        code: 422,
        reason: "Invalid",
        message: 'Gateway "api-agentgateway" is invalid',
        details: {
          causes: [{ field: "spec.listeners", reason: "FieldValueRequired", message: "Required" }],
        },
      }),
    });

    const res = await POST(postRequest(JSON.stringify({ manifest: gateway, mode: "create" })));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatchObject({
      status: 422,
      reason: "Invalid",
      message: 'Gateway "api-agentgateway" is invalid',
    });
    expect(body.error.causes).toEqual([
      { field: "spec.listeners", reason: "FieldValueRequired", message: "Required" },
    ]);
  });
});
