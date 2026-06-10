import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/k8s/client", () => ({
  getApiextensionsClient: vi.fn(),
}));

import { getApiextensionsClient } from "@/lib/k8s/client";
import { GET } from "./route";

const mockedGetApiextensionsClient = vi.mocked(getApiextensionsClient);

const BACKENDS_CRD = "agentgatewaybackends.agentgateway.dev";

function request(crd: string) {
  return new NextRequest(`http://localhost/api/schemas/${crd}`, {
    headers: { "x-kube-context": "test-ctx" },
  });
}

function params(crd: string) {
  return { params: Promise.resolve({ crd }) };
}

describe("GET /api/schemas/[crd]", () => {
  const readCustomResourceDefinition = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetApiextensionsClient.mockReturnValue({ readCustomResourceDefinition } as never);
  });

  it("rejects CRDs outside the registry with 403", async () => {
    const res = await GET(request("deployments.apps"), params("deployments.apps"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("unknown CRD: deployments.apps");
    expect(mockedGetApiextensionsClient).not.toHaveBeenCalled();
  });

  it("serves the cluster CRD schema with only served versions", async () => {
    const servedSchema = { type: "object", properties: { spec: { type: "object" } } };
    readCustomResourceDefinition.mockResolvedValue({
      spec: {
        group: "agentgateway.dev",
        names: { kind: "AgentgatewayBackend", plural: "agentgatewaybackends" },
        scope: "Namespaced",
        versions: [
          { name: "v1alpha1", served: true, schema: { openAPIV3Schema: servedSchema } },
          { name: "v1alpha0", served: false, schema: { openAPIV3Schema: { type: "object" } } },
          { name: "v1alpha2", served: true }, // served but no schema
        ],
      },
    });

    const res = await GET(request(BACKENDS_CRD), params(BACKENDS_CRD));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("cluster");
    expect(body.kind).toBe("AgentgatewayBackend");
    expect(body.group).toBe("agentgateway.dev");
    expect(body.plural).toBe("agentgatewaybackends");
    expect(body.scope).toBe("Namespaced");
    expect(Object.keys(body.versions)).toEqual(["v1alpha1"]);
    expect(body.versions.v1alpha1).toEqual(servedSchema);
    expect(readCustomResourceDefinition).toHaveBeenCalledWith({ name: BACKENDS_CRD });
  });

  it("falls back to the bundled schema when the cluster read fails", async () => {
    readCustomResourceDefinition.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const res = await GET(request(BACKENDS_CRD), params(BACKENDS_CRD));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("bundled");
    expect(body.name).toBe(BACKENDS_CRD);
    expect(body.kind).toBe("AgentgatewayBackend");
    expect(Object.keys(body.versions).length).toBeGreaterThan(0);
  });

  it("falls back to bundled when the cluster CRD has no served schemas", async () => {
    readCustomResourceDefinition.mockResolvedValue({
      spec: {
        group: "agentgateway.dev",
        names: { kind: "AgentgatewayBackend", plural: "agentgatewaybackends" },
        scope: "Namespaced",
        versions: [{ name: "v1alpha1", served: false }],
      },
    });

    const res = await GET(request(BACKENDS_CRD), params(BACKENDS_CRD));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("bundled");
    expect(body.name).toBe(BACKENDS_CRD);
  });
});
