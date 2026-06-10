import { NextRequest, NextResponse } from "next/server";
import { Metrics, type V1Pod } from "@kubernetes/client-node";
import { getCoreClient, getKubeConfig } from "@/lib/k8s/client";
import { contextFrom, errorResponse } from "@/lib/k8s/registry-server";
import { parseCpuMillis, parseMemoryBytes } from "@/lib/quantity";

const GATEWAY_NAME_LABEL = "gateway.networking.k8s.io/gateway-name";
const CONTROL_PLANE_SELECTOR = "app.kubernetes.io/name=agentgateway";

export interface InfraPod {
  name: string;
  namespace: string;
  role: "proxy" | "controlplane";
  gateway?: string;
  phase: string;
  ready: string;
  restarts: number;
  node?: string;
  startTime?: string;
  cpuMillis?: number;
  memoryBytes?: number;
  cpuRequestMillis?: number;
  memoryRequestBytes?: number;
  cpuLimitMillis?: number;
  memoryLimitBytes?: number;
}

function sumResource(
  pod: V1Pod,
  bucket: "requests" | "limits",
  key: "cpu" | "memory",
  parse: (q: string) => number | null,
): number | undefined {
  let total = 0;
  let found = false;
  for (const container of pod.spec?.containers ?? []) {
    const quantity = container.resources?.[bucket]?.[key];
    if (typeof quantity === "string") {
      const value = parse(quantity);
      if (value !== null) {
        total += value;
        found = true;
      }
    }
  }
  return found ? total : undefined;
}

function project(pod: V1Pod, role: "proxy" | "controlplane"): InfraPod {
  const statuses = pod.status?.containerStatuses ?? [];
  const ready = statuses.filter((s) => s.ready).length;
  return {
    name: pod.metadata?.name ?? "?",
    namespace: pod.metadata?.namespace ?? "?",
    role,
    gateway: pod.metadata?.labels?.[GATEWAY_NAME_LABEL],
    phase: pod.status?.phase ?? "Unknown",
    ready: `${ready}/${pod.spec?.containers?.length ?? statuses.length}`,
    restarts: statuses.reduce((n, s) => n + (s.restartCount ?? 0), 0),
    node: pod.spec?.nodeName,
    startTime: pod.status?.startTime
      ? new Date(pod.status.startTime).toISOString()
      : undefined,
    cpuRequestMillis: sumResource(pod, "requests", "cpu", parseCpuMillis),
    memoryRequestBytes: sumResource(pod, "requests", "memory", parseMemoryBytes),
    cpuLimitMillis: sumResource(pod, "limits", "cpu", parseCpuMillis),
    memoryLimitBytes: sumResource(pod, "limits", "memory", parseMemoryBytes),
  };
}

/**
 * agentgateway runtime inventory: data plane pods (one deployment per
 * Gateway, identified by the deployer's gateway-name label) and control
 * plane pods, with live usage from metrics.k8s.io when available.
 */
export async function GET(req: NextRequest) {
  try {
    const context = contextFrom(req);
    const core = getCoreClient(context);

    const [proxyList, cpList] = await Promise.all([
      core.listPodForAllNamespaces({ labelSelector: GATEWAY_NAME_LABEL }),
      core.listPodForAllNamespaces({ labelSelector: CONTROL_PLANE_SELECTOR }),
    ]);

    const pods: InfraPod[] = [
      ...proxyList.items.map((p) => project(p, "proxy")),
      ...cpList.items
        .filter((p) => !p.metadata?.labels?.[GATEWAY_NAME_LABEL])
        .map((p) => project(p, "controlplane")),
    ];

    let metricsAvailable = false;
    try {
      const metrics = new Metrics(getKubeConfig(context));
      const podMetrics = await metrics.getPodMetrics();
      const usage = new Map<string, { cpu: number; mem: number }>();
      for (const item of podMetrics.items) {
        let cpu = 0;
        let mem = 0;
        for (const container of item.containers ?? []) {
          cpu += parseCpuMillis(container.usage?.cpu ?? "") ?? 0;
          mem += parseMemoryBytes(container.usage?.memory ?? "") ?? 0;
        }
        usage.set(`${item.metadata.namespace}/${item.metadata.name}`, { cpu, mem });
      }
      for (const pod of pods) {
        const u = usage.get(`${pod.namespace}/${pod.name}`);
        if (u) {
          pod.cpuMillis = u.cpu;
          pod.memoryBytes = u.mem;
        }
      }
      metricsAvailable = true;
    } catch {
      // metrics-server not installed — pods still render, just without usage.
    }

    return NextResponse.json({ metricsAvailable, pods });
  } catch (err) {
    return errorResponse(err);
  }
}
