import { NextRequest } from "next/server";
import type { V1Pod } from "@kubernetes/client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPodMetrics } = vi.hoisted(() => ({ getPodMetrics: vi.fn() }));

vi.mock("@/lib/k8s/client", () => ({
  getCoreClient: vi.fn(),
  getKubeConfig: vi.fn(() => ({})),
}));

vi.mock("@kubernetes/client-node", async (orig) => ({
  ...(await orig<typeof import("@kubernetes/client-node")>()),
  Metrics: vi.fn(function Metrics() {
    return { getPodMetrics };
  }),
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

function request() {
  return new NextRequest("http://localhost/api/infra", {
    headers: { "x-kube-context": "test-ctx" },
  });
}

describe("GET /api/infra", () => {
  const listPodForAllNamespaces = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCoreClient.mockReturnValue({ listPodForAllNamespaces } as never);
    getPodMetrics.mockResolvedValue({ items: [] });
  });

  function stubPodLists(proxyPods: V1Pod[], cpPods: V1Pod[]) {
    listPodForAllNamespaces.mockImplementation(({ labelSelector }: { labelSelector: string }) => {
      if (labelSelector === GATEWAY_NAME_LABEL) return Promise.resolve({ items: proxyPods });
      if (labelSelector === "app.kubernetes.io/name=agentgateway")
        return Promise.resolve({ items: cpPods });
      return Promise.reject(new Error(`unexpected selector: ${labelSelector}`));
    });
  }

  it("splits proxies and control plane, deduping pods carrying both labels", async () => {
    const proxyPod = makePod({
      name: "gw-proxy-1",
      labels: { [GATEWAY_NAME_LABEL]: "api-agentgateway" },
    });
    const bothPod = makePod({
      name: "gw-proxy-2",
      labels: {
        [GATEWAY_NAME_LABEL]: "api-agentgateway",
        "app.kubernetes.io/name": "agentgateway",
      },
    });
    const cpPod = makePod({
      name: "agentgateway-controller",
      labels: { "app.kubernetes.io/name": "agentgateway" },
    });
    stubPodLists([proxyPod, bothPod], [cpPod, bothPod]);

    const res = await GET(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pods).toHaveLength(3);
    expect(body.pods.map((p: { name: string; role: string }) => [p.name, p.role])).toEqual([
      ["gw-proxy-1", "proxy"],
      ["gw-proxy-2", "proxy"],
      ["agentgateway-controller", "controlplane"],
    ]);
    expect(body.pods[0].gateway).toBe("api-agentgateway");
    expect(body.pods[2].gateway).toBeUndefined();
  });

  it("projects ready/restarts and request/limit totals", async () => {
    const pod = makePod({
      name: "gw-proxy-1",
      namespace: "edge",
      labels: { [GATEWAY_NAME_LABEL]: "api-agentgateway" },
      node: "node-a",
      startTime: "2026-06-01T00:00:00Z",
      containers: [
        {
          name: "proxy",
          resources: {
            requests: { cpu: "100m", memory: "128Mi" },
            limits: { cpu: "1", memory: "256Mi" },
          },
        },
        {
          name: "sidecar",
          resources: { requests: { cpu: "50m", memory: "64Mi" } },
        },
      ],
      containerStatuses: [
        { name: "proxy", ready: true, restartCount: 3 },
        { name: "sidecar", ready: false, restartCount: 2 },
      ] as never,
    });
    stubPodLists([pod], []);

    const res = await GET(request());
    const body = await res.json();

    expect(body.pods).toHaveLength(1);
    expect(body.pods[0]).toMatchObject({
      name: "gw-proxy-1",
      namespace: "edge",
      role: "proxy",
      phase: "Running",
      ready: "1/2",
      restarts: 5,
      node: "node-a",
      startTime: "2026-06-01T00:00:00.000Z",
      cpuRequestMillis: 150,
      memoryRequestBytes: (128 + 64) * 1024 * 1024,
      cpuLimitMillis: 1000,
      memoryLimitBytes: 256 * 1024 * 1024,
    });
    // No limits on the sidecar: totals reflect only containers that declare them.
    expect(body.pods[0].cpuMillis).toBeUndefined();
  });

  it("merges live usage from metrics.k8s.io when available", async () => {
    const pod = makePod({
      name: "gw-proxy-1",
      namespace: "edge",
      labels: { [GATEWAY_NAME_LABEL]: "api-agentgateway" },
    });
    stubPodLists([pod], []);
    getPodMetrics.mockResolvedValue({
      items: [
        {
          metadata: { name: "gw-proxy-1", namespace: "edge" },
          containers: [
            { name: "proxy", usage: { cpu: "5m", memory: "10Mi" } },
            { name: "sidecar", usage: { cpu: "1m", memory: "2Mi" } },
          ],
        },
        {
          metadata: { name: "unrelated", namespace: "other" },
          containers: [{ name: "x", usage: { cpu: "100m", memory: "1Gi" } }],
        },
      ],
    });

    const res = await GET(request());
    const body = await res.json();

    expect(body.metricsAvailable).toBe(true);
    expect(body.pods[0].cpuMillis).toBe(6);
    expect(body.pods[0].memoryBytes).toBe(12 * 1024 * 1024);
  });

  it("still returns pods with metricsAvailable=false when metrics-server is missing", async () => {
    const pod = makePod({
      name: "gw-proxy-1",
      labels: { [GATEWAY_NAME_LABEL]: "api-agentgateway" },
    });
    stubPodLists([pod], []);
    getPodMetrics.mockRejectedValue(new Error("the server could not find metrics.k8s.io"));

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.metricsAvailable).toBe(false);
    expect(body.pods).toHaveLength(1);
    expect(body.pods[0].cpuMillis).toBeUndefined();
    expect(body.pods[0].memoryBytes).toBeUndefined();
  });

  it("returns a parsed error response when listing pods fails", async () => {
    listPodForAllNamespaces.mockRejectedValue({
      code: 401,
      body: JSON.stringify({ kind: "Status", code: 401, reason: "Unauthorized", message: "nope" }),
    });

    const res = await GET(request());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatchObject({ status: 401, reason: "Unauthorized", message: "nope" });
  });
});
