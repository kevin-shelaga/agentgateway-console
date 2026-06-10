import { NextRequest } from "next/server";
import { PassThrough } from "node:stream";
import { Log, type V1Pod } from "@kubernetes/client-node";
import { getCoreClient, getKubeConfig } from "@/lib/k8s/client";
import { contextFrom, errorResponse, forbidden } from "@/lib/k8s/registry-server";

const GATEWAY_NAME_LABEL = "gateway.networking.k8s.io/gateway-name";
const CONTROL_PLANE_NAME_LABEL = "app.kubernetes.io/name";
const CONTROL_PLANE_NAME = "agentgateway";

const DEFAULT_TAIL_LINES = 200;
const MAX_TAIL_LINES = 2000;

type Params = { params: Promise<{ namespace: string; name: string }> };

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

/**
 * Live log tail: kubelet's follow stream piped through as chunked
 * text/plain. The upstream watch is aborted when the browser disconnects
 * (request signal) or the client cancels the reader.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { namespace, name } = await params;
  const query = req.nextUrl.searchParams;
  const tailLines = clampInt(query.get("tailLines"), DEFAULT_TAIL_LINES, 1, MAX_TAIL_LINES);

  try {
    const context = contextFrom(req);
    const core = getCoreClient(context);
    const pod = await core.readNamespacedPod({ name, namespace });
    if (!isAgentgatewayPod(pod)) return forbidden("not an agentgateway pod");

    const specContainers = pod.spec?.containers ?? [];
    const container =
      query.get("container") ?? specContainers[0]?.name ?? "";

    const logClient = new Log(getKubeConfig(context));
    const pass = new PassThrough();
    const upstream = await logClient.log(namespace, name, container, pass, {
      follow: true,
      tailLines,
      timestamps: true,
    });

    const stop = () => upstream.abort();
    req.signal.addEventListener("abort", stop);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        pass.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        pass.on("end", () => {
          try {
            controller.close();
          } catch {
            // already closed by cancel
          }
        });
        pass.on("error", (err) => {
          try {
            controller.error(err);
          } catch {
            // already closed
          }
        });
      },
      cancel: stop,
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-container": container,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
