import { describe, expect, it, vi } from "vitest";

const getKubeConfig = vi.fn();
vi.mock("./client", () => ({ getKubeConfig: (ctx?: string) => getKubeConfig(ctx) }));

import { parseSvcUrl, serviceProxyTarget } from "./service-proxy";

describe("parseSvcUrl", () => {
  it("parses namespace, service, port, and path", () => {
    expect(parseSvcUrl("svc://default/demo-gateway:80/v1/chat/completions")).toEqual({
      namespace: "default",
      service: "demo-gateway",
      port: 80,
      path: "/v1/chat/completions",
    });
  });

  it("defaults the path to /", () => {
    expect(parseSvcUrl("svc://ns/gw:8080")).toMatchObject({ port: 8080, path: "/" });
  });

  it("rejects everything else", () => {
    expect(parseSvcUrl("http://example.com")).toBeNull();
    expect(parseSvcUrl("svc://missing-port/gw")).toBeNull();
    expect(parseSvcUrl("svc://ns/gw:notaport/x")).toBeNull();
    expect(parseSvcUrl("svc://ns/sub/path:80")).toBeNull();
  });
});

describe("serviceProxyTarget", () => {
  function kc(server = "https://10.0.0.1:6443/") {
    return {
      getCurrentCluster: () => ({ server }),
      applyToHTTPSOptions: async (opts: Record<string, unknown>) => {
        opts.headers = { Authorization: "Bearer test-token" };
        opts.ca = Buffer.from("ca");
      },
    };
  }

  it("builds the API-server proxy URL with kubeconfig auth", async () => {
    getKubeConfig.mockReturnValue(kc());
    const target = await serviceProxyTarget("my-ctx", {
      namespace: "default",
      service: "demo-gateway",
      port: 80,
      path: "/v1/chat/completions",
    });
    expect(target.url).toBe(
      "https://10.0.0.1:6443/api/v1/namespaces/default/services/demo-gateway:80/proxy/v1/chat/completions",
    );
    expect(target.headers.Authorization).toBe("Bearer test-token");
    expect(target.dispatcher).toBeDefined();
    expect(getKubeConfig).toHaveBeenCalledWith("my-ctx");
  });

  it("fails when the kubeconfig has no current cluster", async () => {
    getKubeConfig.mockReturnValue({
      getCurrentCluster: () => null,
      applyToHTTPSOptions: async () => {},
    });
    await expect(
      serviceProxyTarget(undefined, { namespace: "a", service: "b", port: 1, path: "/" }),
    ).rejects.toThrow(/no current cluster/);
  });
});
