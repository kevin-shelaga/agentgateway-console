import { NextRequest, NextResponse } from "next/server";
import type { V1ContainerStatus, V1Pod } from "@kubernetes/client-node";
import { getCoreClient } from "@/lib/k8s/client";
import { contextFrom, errorResponse, forbidden } from "@/lib/k8s/registry-server";

const GATEWAY_NAME_LABEL = "gateway.networking.k8s.io/gateway-name";
const CONTROL_PLANE_NAME_LABEL = "app.kubernetes.io/name";
const CONTROL_PLANE_NAME = "agentgateway";

type Params = { params: Promise<{ namespace: string; name: string }> };

export interface PodContainer {
  name: string;
  image?: string;
  ready: boolean;
  restartCount: number;
  state?: string;
}

export interface PodDetail {
  name: string;
  namespace: string;
  role: "proxy" | "controlplane";
  gateway?: string;
  phase: string;
  ready: string;
  restarts: number;
  node?: string;
  startTime?: string;
  labels: Record<string, string>;
  containers: PodContainer[];
}

/**
 * The console only ever exposes agentgateway pods: data plane pods carry the
 * deployer's gateway-name label, control plane pods the agentgateway app name.
 */
function agentgatewayRole(pod: V1Pod): "proxy" | "controlplane" | undefined {
  const labels = pod.metadata?.labels ?? {};
  if (labels[GATEWAY_NAME_LABEL]) return "proxy";
  if (labels[CONTROL_PLANE_NAME_LABEL] === CONTROL_PLANE_NAME) return "controlplane";
  return undefined;
}

/** "running" | "waiting" | "terminated", with the reason when one is set. */
function containerState(status: V1ContainerStatus | undefined): string | undefined {
  const state = status?.state;
  if (!state) return undefined;
  if (state.running) return "running";
  if (state.waiting) {
    return state.waiting.reason ? `waiting: ${state.waiting.reason}` : "waiting";
  }
  if (state.terminated) {
    return state.terminated.reason ? `terminated: ${state.terminated.reason}` : "terminated";
  }
  return undefined;
}

function project(pod: V1Pod, role: "proxy" | "controlplane"): PodDetail {
  const statuses = pod.status?.containerStatuses ?? [];
  const byName = new Map(statuses.map((s) => [s.name, s]));
  const specContainers = pod.spec?.containers ?? [];
  const ready = statuses.filter((s) => s.ready).length;
  return {
    name: pod.metadata?.name ?? "?",
    namespace: pod.metadata?.namespace ?? "?",
    role,
    gateway: pod.metadata?.labels?.[GATEWAY_NAME_LABEL],
    phase: pod.status?.phase ?? "Unknown",
    ready: `${ready}/${specContainers.length || statuses.length}`,
    restarts: statuses.reduce((n, s) => n + (s.restartCount ?? 0), 0),
    node: pod.spec?.nodeName,
    startTime: pod.status?.startTime
      ? new Date(pod.status.startTime).toISOString()
      : undefined,
    labels: pod.metadata?.labels ?? {},
    containers: specContainers.map((c) => {
      const status = byName.get(c.name);
      return {
        name: c.name,
        image: c.image,
        ready: status?.ready ?? false,
        restartCount: status?.restartCount ?? 0,
        state: containerState(status),
      };
    }),
  };
}

/** Detail view for a single agentgateway pod (proxy or control plane). */
export async function GET(req: NextRequest, { params }: Params) {
  const { namespace, name } = await params;
  try {
    const core = getCoreClient(contextFrom(req));
    const pod = await core.readNamespacedPod({ name, namespace });
    const role = agentgatewayRole(pod);
    if (!role) return forbidden("not an agentgateway pod");
    return NextResponse.json(project(pod, role));
  } catch (err) {
    return errorResponse(err);
  }
}
