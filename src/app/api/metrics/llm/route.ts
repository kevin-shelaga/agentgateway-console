import { NextRequest, NextResponse } from "next/server";
import { getCoreClient } from "@/lib/k8s/client";
import { contextFrom, errorResponse } from "@/lib/k8s/registry-server";
import { mergeSamples, parsePrometheusText, type PromSample } from "@/lib/prom-parse";

const GATEWAY_NAME_LABEL = "gateway.networking.k8s.io/gateway-name";
const METRICS_PORT = 15020;
/** Metric families the usage page consumes; everything else is dropped. */
const WANTED_PREFIXES = [
  "agentgateway_gen_ai_client_token_usage",
  "agentgateway_requests",
  "agentgateway_request_duration",
];

export interface LlmMetricsResponse {
  /** Pods successfully scraped (proxy replicas sum into one series set). */
  scraped: string[];
  /** Pods that failed to scrape (starting, terminating, old version). */
  failed: string[];
  samples: PromSample[];
  /** Server clock for rate computation against the previous poll. */
  at: number;
}

/**
 * Scrapes every agentgateway proxy pod's :15020/metrics through the
 * API-server pod proxy (no direct network path needed) and sums counters
 * across replicas per label-set — what PromQL sum() would do at query time.
 */
export async function GET(req: NextRequest) {
  try {
    const core = getCoreClient(contextFrom(req));
    const pods = await core.listPodForAllNamespaces({ labelSelector: GATEWAY_NAME_LABEL });

    const scraped: string[] = [];
    const failed: string[] = [];
    const perPod: PromSample[][] = [];

    await Promise.all(
      pods.items.map(async (pod) => {
        const name = pod.metadata?.name;
        const namespace = pod.metadata?.namespace;
        if (!name || !namespace || pod.status?.phase !== "Running") return;
        const key = `${namespace}/${name}`;
        try {
          const text = (await core.connectGetNamespacedPodProxyWithPath({
            name: `${name}:${METRICS_PORT}`,
            namespace,
            path: "metrics",
          })) as unknown as string;
          // Buckets are dropped: the page derives averages from _sum/_count.
          perPod.push(
            parsePrometheusText(String(text), WANTED_PREFIXES).filter(
              (s) => !s.name.endsWith("_bucket"),
            ),
          );
          scraped.push(key);
        } catch {
          failed.push(key);
        }
      }),
    );

    const body: LlmMetricsResponse = {
      scraped,
      failed,
      samples: mergeSamples(perPod),
      at: Date.now(),
    };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
