import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/k8s/client", () => ({
  getCoreClient: vi.fn(),
  getKubeConfig: vi.fn(),
  isInCluster: vi.fn(),
}));

import { getCoreClient, getKubeConfig, isInCluster } from "@/lib/k8s/client";
import { GET } from "./route";

const mockedGetCoreClient = vi.mocked(getCoreClient);
const mockedGetKubeConfig = vi.mocked(getKubeConfig);
const mockedIsInCluster = vi.mocked(isInCluster);

function request(context?: string) {
  return new NextRequest("http://localhost/api/cluster", {
    headers: context ? { "x-kube-context": context } : {},
  });
}

describe("GET /api/cluster", () => {
  const listNamespace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsInCluster.mockReturnValue(false);
    mockedGetKubeConfig.mockReturnValue({ getCurrentContext: () => "my-ctx" } as never);
    mockedGetCoreClient.mockReturnValue({ listNamespace } as never);
  });

  it("reports connected with the resolved kubeconfig context", async () => {
    listNamespace.mockResolvedValue({ items: [] });

    const res = await GET(request("my-ctx"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: true, context: "my-ctx" });
    expect(listNamespace).toHaveBeenCalledWith({ limit: 1 });
    expect(mockedGetCoreClient).toHaveBeenCalledWith("my-ctx");
  });

  it("reports disconnected with the error message when the probe fails", async () => {
    listNamespace.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:6443"));

    const res = await GET(request("my-ctx"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      connected: false,
      context: "my-ctx",
      error: "connect ECONNREFUSED 127.0.0.1:6443",
    });
  });

  it("reports null context when no context header is sent and probe fails", async () => {
    listNamespace.mockRejectedValue(new Error("boom"));

    const res = await GET(request());

    const body = await res.json();
    expect(body.connected).toBe(false);
    expect(body.context).toBeNull();
  });

  it('reports "in-cluster" on failure when running inside Kubernetes', async () => {
    mockedIsInCluster.mockReturnValue(true);
    listNamespace.mockRejectedValue(new Error("forbidden"));

    const res = await GET(request("ignored-ctx"));

    const body = await res.json();
    expect(body.connected).toBe(false);
    expect(body.context).toBe("in-cluster");
    expect(body.error).toBe("forbidden");
  });
});
