import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const listPodForAllNamespaces = vi.fn();
const connectGetNamespacedPodProxyWithPath = vi.fn();

vi.mock("@/lib/k8s/client", () => ({
  getCoreClient: () => ({ listPodForAllNamespaces, connectGetNamespacedPodProxyWithPath }),
}));

import { GET } from "./route";

function pod(name: string, phase = "Running") {
  return {
    metadata: { name, namespace: "agw", labels: { "gateway.networking.k8s.io/gateway-name": "gw" } },
    status: { phase },
  };
}

const METRICS_A = `# TYPE agentgateway_requests counter
agentgateway_requests_total{gateway="agw/gw",status="200"} 100
agentgateway_gen_ai_client_token_usage_sum{gen_ai_token_type="input",gen_ai_request_model="gpt-4o-mini"} 5000
agentgateway_gen_ai_client_token_usage_bucket{gen_ai_token_type="input",le="+Inf"} 10
agentgateway_cgroup_usage 999
`;
const METRICS_B = `agentgateway_requests_total{gateway="agw/gw",status="200"} 40
agentgateway_gen_ai_client_token_usage_sum{gen_ai_token_type="input",gen_ai_request_model="gpt-4o-mini"} 1000
`;

afterEach(() => {
  listPodForAllNamespaces.mockReset();
  connectGetNamespacedPodProxyWithPath.mockReset();
});

describe("GET /api/metrics/llm", () => {
  it("scrapes all running proxies via the API-server proxy and sums replicas", async () => {
    listPodForAllNamespaces.mockResolvedValue({ items: [pod("p1"), pod("p2"), pod("p3", "Pending")] });
    connectGetNamespacedPodProxyWithPath
      .mockResolvedValueOnce(METRICS_A)
      .mockResolvedValueOnce(METRICS_B);

    const res = await GET(new NextRequest("http://x/api/metrics/llm"));
    const body = await res.json();

    expect(body.scraped.sort()).toEqual(["agw/p1", "agw/p2"]);
    expect(body.failed).toEqual([]);
    // Pending pod is never scraped.
    expect(connectGetNamespacedPodProxyWithPath).toHaveBeenCalledTimes(2);
    expect(connectGetNamespacedPodProxyWithPath).toHaveBeenCalledWith({
      name: "p1:15020",
      namespace: "agw",
      path: "metrics",
    });

    const requests = body.samples.find(
      (s: { name: string }) => s.name === "agentgateway_requests_total",
    );
    expect(requests.value).toBe(140); // 100 + 40 across replicas
    const tokens = body.samples.find((s: { name: string }) => s.name.endsWith("_usage_sum"));
    expect(tokens.value).toBe(6000);
    // Buckets and unwanted families are dropped.
    expect(body.samples.some((s: { name: string }) => s.name.endsWith("_bucket"))).toBe(false);
    expect(body.samples.some((s: { name: string }) => s.name.includes("cgroup"))).toBe(false);
    expect(typeof body.at).toBe("number");
  });

  it("reports unscrapeable pods without failing the response", async () => {
    listPodForAllNamespaces.mockResolvedValue({ items: [pod("p1"), pod("p2")] });
    connectGetNamespacedPodProxyWithPath
      .mockResolvedValueOnce(METRICS_A)
      .mockRejectedValueOnce(new Error("connect refused"));

    const body = await (await GET(new NextRequest("http://x/api/metrics/llm"))).json();
    expect(body.scraped).toEqual(["agw/p1"]);
    expect(body.failed).toEqual(["agw/p2"]);
    expect(body.samples.length).toBeGreaterThan(0);
  });

  it("maps pod-list failures through the error envelope", async () => {
    listPodForAllNamespaces.mockRejectedValue({
      code: 403,
      body: JSON.stringify({ kind: "Status", code: 403, reason: "Forbidden", message: "no" }),
    });
    const res = await GET(new NextRequest("http://x/api/metrics/llm"));
    expect(res.status).toBe(403);
  });
});
