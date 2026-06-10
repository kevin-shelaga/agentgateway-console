import { NextRequest, NextResponse } from "next/server";
import type { V1Pod } from "@kubernetes/client-node";
import { getCoreClient } from "@/lib/k8s/client";
import { contextFrom, errorResponse, forbidden } from "@/lib/k8s/registry-server";

const GATEWAY_NAME_LABEL = "gateway.networking.k8s.io/gateway-name";
const CONTROL_PLANE_NAME_LABEL = "app.kubernetes.io/name";
const CONTROL_PLANE_NAME = "agentgateway";

const DEFAULT_TAIL_LINES = 500;
const MAX_TAIL_LINES = 2000;
const MAX_SINCE_SECONDS = 86400;

type Params = { params: Promise<{ namespace: string; name: string }> };

/** Same scope guard as the pod detail route: agentgateway pods only. */
function isAgentgatewayPod(pod: V1Pod): boolean {
  const labels = pod.metadata?.labels ?? {};
  return (
    !!labels[GATEWAY_NAME_LABEL] || labels[CONTROL_PLANE_NAME_LABEL] === CONTROL_PLANE_NAME
  );
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Tail of a container's logs for an agentgateway pod, always timestamped. */
export async function GET(req: NextRequest, { params }: Params) {
  const { namespace, name } = await params;
  const query = req.nextUrl.searchParams;
  const container = query.get("container") ?? undefined;
  const tailLines = clampInt(query.get("tailLines"), DEFAULT_TAIL_LINES, 1, MAX_TAIL_LINES);
  const sinceRaw = query.get("sinceSeconds");
  const sinceSeconds =
    sinceRaw === null ? undefined : clampInt(sinceRaw, MAX_SINCE_SECONDS, 1, MAX_SINCE_SECONDS);

  try {
    const core = getCoreClient(contextFrom(req));
    const pod = await core.readNamespacedPod({ name, namespace });
    if (!isAgentgatewayPod(pod)) return forbidden("not an agentgateway pod");

    const logs = await core.readNamespacedPodLog({
      name,
      namespace,
      ...(container ? { container } : {}),
      tailLines,
      ...(sinceSeconds !== undefined ? { sinceSeconds } : {}),
      timestamps: true,
    });

    // The container k8s actually read: the explicit param, or the pod's only
    // container (the k8s default when none is given).
    const specContainers = pod.spec?.containers ?? [];
    const effectiveContainer =
      container ?? (specContainers.length === 1 ? specContainers[0].name : null);

    return NextResponse.json({ logs, container: effectiveContainer });
  } catch (err) {
    return errorResponse(err);
  }
}
