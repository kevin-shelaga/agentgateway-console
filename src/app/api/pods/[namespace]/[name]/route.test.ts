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
  containerStatuses?: NonNullable<V1Pod["status"]>["containerStatuses"];
  phase?: string;
  node?: string;
  startTime?: string;
}): V1Pod {
  return {
    metadata: {
      name: opts.name,
      namespace: opts.namespace ?? "agentgateway-system",
      labels: opts.labels,
    },
    spec: {
      containers: opts.containers ?? [{ name: "main" }],
      nodeName: opts.node,
    },
    status: {
      phase: opts.phase ?? "Running",
      containerStatuses: opts.containerStatuses,
      startTime: opts.startTime ? (new Date(opts.startTime) as never) : undefined,
    },
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

describe("GET /api/pods/[namespace]/[name]", () => {
  const readNamespacedPod = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCoreClient.mockReturnValue({ readNamespacedPod } as never);
  });

  it("projects a proxy pod with container states and reasons", async () => {
    readNamespacedPod.mockResolvedValue(
      makePod({
        name: "gw-proxy-1",
        namespace: "edge",
        labels: { [GATEWAY_NAME_LABEL]: "api-agentgateway", "pod-template-hash": "abc" },
        node: "node-a",
        startTime: "2026-06-01T00:00:00Z",
        containers: [
          { name: "proxy", image: "ghcr.io/agentgateway/agentgateway:0.5.0" },
          { name: "sidecar", image: "busybox:1" },
          { name: "init-ish", image: "busybox:1" },
        ],
        containerStatuses: [
          {
            name: "proxy",
            ready: true,
            restartCount: 3,
            state: { running: { startedAt: new Date("2026-06-01T00:00:01Z") } },
          },
          {
            name: "sidecar",
            ready: false,
            restartCount: 7,
            state: { waiting: { reason: "CrashLoopBackOff" } },
          },
          {
            name: "init-ish",
            ready: false,
            restartCount: 0,
            state: { terminated: { reason: "Error", exitCode: 1 } },
          },
        ] as never,
      }),
    );

    const res = await GET(request("/api/pods/edge/gw-proxy-1"), params("edge", "gw-proxy-1"));

    expect(res.status).toBe(200);
    expect(readNamespacedPod).toHaveBeenCalledWith({ name: "gw-proxy-1", namespace: "edge" });
    const body = await res.json();
    expect(body).toMatchObject({
      name: "gw-proxy-1",
      namespace: "edge",
      role: "proxy",
      gateway: "api-agentgateway",
      phase: "Running",
      ready: "1/3",
      restarts: 10,
      node: "node-a",
      startTime: "2026-06-01T00:00:00.000Z",
      labels: { [GATEWAY_NAME_LABEL]: "api-agentgateway", "pod-template-hash": "abc" },
    });
    expect(body.containers).toEqual([
      {
        name: "proxy",
        image: "ghcr.io/agentgateway/agentgateway:0.5.0",
        ready: true,
        restartCount: 3,
        state: "running",
      },
      {
        name: "sidecar",
        image: "busybox:1",
        ready: false,
        restartCount: 7,
        state: "waiting: CrashLoopBackOff",
      },
      {
        name: "init-ish",
        image: "busybox:1",
        ready: false,
        restartCount: 0,
        state: "terminated: Error",
      },
    ]);
  });

  it("identifies a control plane pod without a gateway", async () => {
    readNamespacedPod.mockResolvedValue(
      makePod({
        name: "agentgateway-controller",
        labels: { "app.kubernetes.io/name": "agentgateway" },
        containerStatuses: [
          { name: "main", ready: true, restartCount: 0, state: { running: {} } },
        ] as never,
      }),
    );

    const res = await GET(
      request("/api/pods/agentgateway-system/agentgateway-controller"),
      params("agentgateway-system", "agentgateway-controller"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("controlplane");
    expect(body.gateway).toBeUndefined();
    expect(body.ready).toBe("1/1");
  });

  it("returns 403 for a non-agentgateway pod without echoing pod contents", async () => {
    readNamespacedPod.mockResolvedValue(
      makePod({
        name: "some-app",
        namespace: "default",
        labels: { app: "super-secret-workload" },
        containers: [{ name: "app", image: "registry.internal/secret-image:1" }],
      }),
    );

    const res = await GET(request("/api/pods/default/some-app"), params("default", "some-app"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatchObject({ status: 403, reason: "Forbidden" });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("super-secret-workload");
    expect(raw).not.toContain("secret-image");
    expect(raw).not.toContain("labels");
  });

  it("returns a parsed error response when the pod read fails", async () => {
    readNamespacedPod.mockRejectedValue({
      code: 404,
      body: JSON.stringify({
        kind: "Status",
        code: 404,
        reason: "NotFound",
        message: 'pods "gone" not found',
      }),
    });

    const res = await GET(request("/api/pods/edge/gone"), params("edge", "gone"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatchObject({
      status: 404,
      reason: "NotFound",
      message: 'pods "gone" not found',
    });
  });
});
