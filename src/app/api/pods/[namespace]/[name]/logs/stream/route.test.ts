import { NextRequest } from "next/server";
import type { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const readNamespacedPod = vi.fn();
const logFn = vi.fn();
const abortSpy = vi.fn();

vi.mock("@/lib/k8s/client", () => ({
  getCoreClient: () => ({ readNamespacedPod }),
  getKubeConfig: () => ({}),
}));

vi.mock("@kubernetes/client-node", async (orig) => ({
  ...(await orig<object>()),
  Log: class {
    log(
      namespace: string,
      pod: string,
      container: string,
      stream: Writable,
      options: Record<string, unknown>,
    ) {
      logFn(namespace, pod, container, options);
      stream.write("2026-06-10T12:00:00Z line one\n");
      stream.write("2026-06-10T12:00:01Z line two\n");
      stream.end();
      return Promise.resolve({ abort: abortSpy } as unknown as AbortController);
    }
  },
}));

import { GET } from "./route";

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/pods/ns/pod-1/logs/stream${query}`);
}

function paramsOf(namespace: string, name: string) {
  return { params: Promise.resolve({ namespace, name }) };
}

const proxyPod = {
  metadata: {
    name: "pod-1",
    namespace: "ns",
    labels: { "gateway.networking.k8s.io/gateway-name": "gw" },
  },
  spec: { containers: [{ name: "agentgateway" }, { name: "sidecar" }] },
};

afterEach(() => {
  readNamespacedPod.mockReset();
  logFn.mockReset();
  abortSpy.mockReset();
});

describe("GET /api/pods/[ns]/[name]/logs/stream", () => {
  it("streams chunked text with follow + timestamps and the resolved container", async () => {
    readNamespacedPod.mockResolvedValue(proxyPod);
    const res = await GET(request("?tailLines=50"), paramsOf("ns", "pod-1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("x-container")).toBe("agentgateway");
    expect(await res.text()).toBe(
      "2026-06-10T12:00:00Z line one\n2026-06-10T12:00:01Z line two\n",
    );
    expect(logFn).toHaveBeenCalledWith("ns", "pod-1", "agentgateway", {
      follow: true,
      tailLines: 50,
      timestamps: true,
    });
  });

  it("honors an explicit container and clamps tailLines", async () => {
    readNamespacedPod.mockResolvedValue(proxyPod);
    await (await GET(request("?container=sidecar&tailLines=99999"), paramsOf("ns", "pod-1"))).text();
    expect(logFn).toHaveBeenCalledWith(
      "ns",
      "pod-1",
      "sidecar",
      expect.objectContaining({ tailLines: 2000 }),
    );
  });

  it("refuses non-agentgateway pods before opening any stream", async () => {
    readNamespacedPod.mockResolvedValue({
      metadata: { name: "other", namespace: "ns", labels: { app: "something" } },
      spec: { containers: [{ name: "c" }] },
    });
    const res = await GET(request(), paramsOf("ns", "other"));
    expect(res.status).toBe(403);
    expect(logFn).not.toHaveBeenCalled();
  });

  it("maps pod-read failures through the error envelope", async () => {
    readNamespacedPod.mockRejectedValue({
      code: 404,
      body: JSON.stringify({ kind: "Status", code: 404, reason: "NotFound", message: "nope" }),
    });
    const res = await GET(request(), paramsOf("ns", "gone"));
    expect(res.status).toBe(404);
  });
});
