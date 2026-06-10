import { NextRequest } from "next/server";
import type { V1Pod } from "@kubernetes/client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/k8s/client", () => ({
  getCoreClient: vi.fn(),
}));

import { getCoreClient } from "@/lib/k8s/client";
import { GET } from "./route";

const mockedGetCoreClient = vi.mocked(getCoreClient);

const GATEWAY_NAME_LABEL = "gateway.networking.k8s.io/gateway-name";

function makePod(opts: {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  containers?: NonNullable<V1Pod["spec"]>["containers"];
}): V1Pod {
  return {
    metadata: {
      name: opts.name,
      namespace: opts.namespace ?? "agentgateway-system",
      labels: opts.labels,
    },
    spec: {
      containers: opts.containers ?? [{ name: "main" }],
    },
    status: { phase: "Running" },
  } as V1Pod;
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "x-kube-context": "test-ctx" },
  });
}

function params(namespace: string, name: string) {
  return { params: Promise.resolve({ namespace, name }) };
}

const proxyPod = makePod({
  name: "gw-proxy-1",
  namespace: "edge",
  labels: { [GATEWAY_NAME_LABEL]: "api-agentgateway" },
  containers: [{ name: "agentgateway" }],
});

describe("GET /api/pods/[namespace]/[name]/logs", () => {
  const readNamespacedPod = vi.fn();
  const readNamespacedPodLog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCoreClient.mockReturnValue({ readNamespacedPod, readNamespacedPodLog } as never);
    readNamespacedPod.mockResolvedValue(proxyPod);
    readNamespacedPodLog.mockResolvedValue("2026-06-10T00:00:00Z hello\n");
  });

  it("returns logs with defaults: tailLines 500, timestamps always on", async () => {
    const res = await GET(
      request("/api/pods/edge/gw-proxy-1/logs"),
      params("edge", "gw-proxy-1"),
    );

    expect(res.status).toBe(200);
    expect(readNamespacedPod).toHaveBeenCalledWith({ name: "gw-proxy-1", namespace: "edge" });
    expect(readNamespacedPodLog).toHaveBeenCalledWith({
      name: "gw-proxy-1",
      namespace: "edge",
      tailLines: 500,
      timestamps: true,
    });
    expect(await res.json()).toEqual({
      logs: "2026-06-10T00:00:00Z hello\n",
      container: "agentgateway",
    });
  });

  it("passes the container param through and echoes it back", async () => {
    const res = await GET(
      request("/api/pods/edge/gw-proxy-1/logs?container=sidecar"),
      params("edge", "gw-proxy-1"),
    );

    expect(res.status).toBe(200);
    expect(readNamespacedPodLog).toHaveBeenCalledWith(
      expect.objectContaining({ container: "sidecar", timestamps: true }),
    );
    expect((await res.json()).container).toBe("sidecar");
  });

  it("reports container: null when none is given and the pod has several", async () => {
    readNamespacedPod.mockResolvedValue(
      makePod({
        name: "gw-proxy-1",
        namespace: "edge",
        labels: { [GATEWAY_NAME_LABEL]: "api-agentgateway" },
        containers: [{ name: "a" }, { name: "b" }],
      }),
    );

    const res = await GET(
      request("/api/pods/edge/gw-proxy-1/logs"),
      params("edge", "gw-proxy-1"),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).container).toBeNull();
  });

  it("clamps tailLines into 1..2000", async () => {
    await GET(
      request("/api/pods/edge/gw-proxy-1/logs?tailLines=99999"),
      params("edge", "gw-proxy-1"),
    );
    expect(readNamespacedPodLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ tailLines: 2000, timestamps: true }),
    );

    await GET(
      request("/api/pods/edge/gw-proxy-1/logs?tailLines=0"),
      params("edge", "gw-proxy-1"),
    );
    expect(readNamespacedPodLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ tailLines: 1 }),
    );

    await GET(
      request("/api/pods/edge/gw-proxy-1/logs?tailLines=bogus"),
      params("edge", "gw-proxy-1"),
    );
    expect(readNamespacedPodLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ tailLines: 500 }),
    );
  });

  it("clamps sinceSeconds to at most 86400 and omits it by default", async () => {
    await GET(
      request("/api/pods/edge/gw-proxy-1/logs?sinceSeconds=999999"),
      params("edge", "gw-proxy-1"),
    );
    expect(readNamespacedPodLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ sinceSeconds: 86400 }),
    );

    await GET(
      request("/api/pods/edge/gw-proxy-1/logs?sinceSeconds=3600"),
      params("edge", "gw-proxy-1"),
    );
    expect(readNamespacedPodLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ sinceSeconds: 3600 }),
    );

    await GET(request("/api/pods/edge/gw-proxy-1/logs"), params("edge", "gw-proxy-1"));
    const lastCall = readNamespacedPodLog.mock.calls.at(-1)?.[0];
    expect(lastCall).not.toHaveProperty("sinceSeconds");
  });

  it("works for control plane pods too", async () => {
    readNamespacedPod.mockResolvedValue(
      makePod({
        name: "agentgateway-controller",
        labels: { "app.kubernetes.io/name": "agentgateway" },
        containers: [{ name: "controller" }],
      }),
    );

    const res = await GET(
      request("/api/pods/agentgateway-system/agentgateway-controller/logs"),
      params("agentgateway-system", "agentgateway-controller"),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).container).toBe("controller");
  });

  it("returns 403 for a non-agentgateway pod without reading or echoing anything", async () => {
    readNamespacedPod.mockResolvedValue(
      makePod({
        name: "some-app",
        namespace: "default",
        labels: { app: "super-secret-workload" },
        containers: [{ name: "app", image: "registry.internal/secret-image:1" }],
      }),
    );

    const res = await GET(
      request("/api/pods/default/some-app/logs"),
      params("default", "some-app"),
    );

    expect(res.status).toBe(403);
    expect(readNamespacedPodLog).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toMatchObject({ status: 403, reason: "Forbidden" });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("super-secret-workload");
    expect(raw).not.toContain("secret-image");
    expect(raw).not.toContain("labels");
  });

  it("returns a parsed error when the log read fails (e.g. container starting)", async () => {
    readNamespacedPodLog.mockRejectedValue({
      code: 400,
      body: JSON.stringify({
        kind: "Status",
        code: 400,
        reason: "BadRequest",
        message: 'container "agentgateway" in pod "gw-proxy-1" is waiting to start',
      }),
    });

    const res = await GET(
      request("/api/pods/edge/gw-proxy-1/logs"),
      params("edge", "gw-proxy-1"),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatchObject({ status: 400, reason: "BadRequest" });
  });

  it("returns a parsed error when the pod read itself fails", async () => {
    readNamespacedPod.mockRejectedValue({
      code: 404,
      body: JSON.stringify({
        kind: "Status",
        code: 404,
        reason: "NotFound",
        message: 'pods "gone" not found',
      }),
    });

    const res = await GET(request("/api/pods/edge/gone/logs"), params("edge", "gone"));

    expect(res.status).toBe(404);
    expect(readNamespacedPodLog).not.toHaveBeenCalled();
    expect((await res.json()).error).toMatchObject({ status: 404, reason: "NotFound" });
  });
});
