import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createResource,
  deleteResource,
  dryRunResource,
  fetchClusterInfo,
  fetchContexts,
  fetchInfra,
  fetchSchema,
  getResourceItem,
  listResources,
  updateResource,
} from "./api-client";
import { getResource } from "./registry";
import { gateway } from "@/test/fixtures";

const gateways = getResource("gateways")!;
const gatewayclasses = getResource("gatewayclasses")!;
const namespaces = getResource("namespaces")!;

function stubFetch(body: unknown, status = 200) {
  const spy = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("URL construction", () => {
  it("lists namespaced resources with namespace filter", async () => {
    const spy = stubFetch({ items: [gateway] });
    const items = await listResources(gateways, "agentgateway-system");
    expect(items).toHaveLength(1);
    expect(spy.mock.calls[0][0]).toBe(
      "/api/resources/gateway.networking.k8s.io/v1/gateways?namespace=agentgateway-system",
    );
  });

  it("uses the core segment for core-group kinds", async () => {
    const spy = stubFetch({ items: [] });
    await listResources(namespaces);
    expect(spy.mock.calls[0][0]).toBe("/api/resources/core/v1/namespaces");
  });

  it("uses the cluster segment for cluster-scoped items", async () => {
    const spy = stubFetch(gateway);
    await getResourceItem(gatewayclasses, undefined, "agentgateway");
    expect(spy.mock.calls[0][0]).toBe(
      "/api/resources/gateway.networking.k8s.io/v1/gatewayclasses/_cluster/agentgateway",
    );
  });

  it("rejects item paths without a namespace for namespaced kinds", async () => {
    stubFetch(gateway);
    await expect(getResourceItem(gateways, undefined, "gw")).rejects.toThrow(/namespace required/);
  });
});

describe("mutations", () => {
  it("creates via POST and updates via PUT to the item path", async () => {
    const spy = stubFetch(gateway);
    await createResource(gateways, gateway);
    expect(spy.mock.calls[0][1]?.method).toBe("POST");
    await updateResource(gateways, gateway);
    const [url, init] = spy.mock.calls[1];
    expect(init?.method).toBe("PUT");
    expect(url).toContain("/agentgateway-system/api-agentgateway");
  });

  it("deletes and dry-runs", async () => {
    const spy = stubFetch({ ok: true });
    await deleteResource(gateways, "ns", "gw");
    expect(spy.mock.calls[0][1]?.method).toBe("DELETE");
    await dryRunResource(gateway, "update");
    expect(spy.mock.calls[1][0]).toBe("/api/dry-run");
    expect(JSON.parse(spy.mock.calls[1][1]?.body as string).mode).toBe("update");
  });
});

describe("error handling", () => {
  it("throws ApiError with the parsed server error", async () => {
    stubFetch(
      { error: { status: 422, reason: "Invalid", message: "bad spec", causes: [{ field: "spec" }] } },
      422,
    );
    const err = await listResources(gateways).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.parsed.status).toBe(422);
    expect(err.parsed.causes).toHaveLength(1);
  });

  it("synthesizes an error when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502, statusText: "Bad Gateway" })),
    );
    const err = await listResources(gateways).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.parsed.status).toBe(502);
  });
});

describe("simple endpoints", () => {
  it("fetches schema, contexts, cluster, infra", async () => {
    const spy = stubFetch({
      // one shape is fine; we only assert the URLs
      versions: {},
      contexts: [],
      connected: true,
      pods: [],
    });
    await fetchSchema("agentgatewaybackends.agentgateway.dev");
    await fetchContexts();
    await fetchClusterInfo();
    await fetchInfra();
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      "/api/schemas/agentgatewaybackends.agentgateway.dev",
      "/api/contexts",
      "/api/cluster",
      "/api/infra",
    ]);
  });
});
