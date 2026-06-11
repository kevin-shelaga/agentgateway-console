import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const serviceProxyTarget = vi.fn();
vi.mock("@/lib/k8s/service-proxy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/k8s/service-proxy")>()),
  serviceProxyTarget: (...args: unknown[]) => serviceProxyTarget(...args),
}));

import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://console.local/api/llm-test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  serviceProxyTarget.mockReset();
});

describe("POST /api/llm-test", () => {
  it("rejects non-JSON bodies and non-http(s) urls", async () => {
    const bad = new NextRequest("http://console.local/api/llm-test", {
      method: "POST",
      body: "not json",
    });
    expect((await POST(bad)).status).toBe(403);
    expect((await POST(request({ url: "ftp://x" }))).status).toBe(403);
    expect((await POST(request({ url: "::bad::" }))).status).toBe(403);
  });

  it("proxies the call with Host + auth headers and returns parsed JSON + latency", async () => {
    const upstream = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "hi" } }],
          usage: { total_tokens: 10 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", upstream);

    const res = await POST(
      request({
        url: "http://4.229.185.215/v1/chat/completions",
        hostname: "chat.example.com",
        authHeader: { name: "Authorization", value: "Bearer sk-test" },
        body: { model: "gpt-4o-mini", messages: [] },
      }),
    );
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.status).toBe(200);
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(payload.body.choices[0].message.content).toBe("hi");

    const [, init] = upstream.mock.calls[0] as unknown as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.host).toBe("chat.example.com");
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).model).toBe("gpt-4o-mini");
  });

  it("returns text bodies untouched and reports upstream failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("plain error", { status: 503 })));
    const res = await POST(request({ url: "http://gw/v1/chat/completions", body: {} }));
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.status).toBe(503);
    expect(payload.body).toBe("plain error");
  });

  it("relays svc:// urls through the API-server proxy with kubeconfig auth", async () => {
    serviceProxyTarget.mockResolvedValue({
      url: "https://10.0.0.1:6443/api/v1/namespaces/default/services/demo-gateway:80/proxy/v1/chat/completions",
      headers: { Authorization: "Bearer kube-token" },
      dispatcher: {},
    });
    const upstream = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstream);

    const res = await POST(
      request({
        url: "svc://default/demo-gateway:80/v1/chat/completions",
        hostname: "ignored.example.com",
        body: { model: "gpt-4o-mini", messages: [] },
      }),
    );
    expect((await res.json()).ok).toBe(true);

    const [url, init] = upstream.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain("/services/demo-gateway:80/proxy/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer kube-token");
    // The API server routes by its own host; the route hostname must not leak.
    expect(headers.host).toBeUndefined();
  });

  it("rejects gateway-bound Authorization headers on svc:// urls", async () => {
    const res = await POST(
      request({
        url: "svc://default/demo-gateway:80/v1/chat/completions",
        authHeader: { name: "Authorization", value: "Bearer sk-test" },
        body: {},
      }),
    );
    expect(res.status).toBe(403);
    serviceProxyTarget.mockClear();
    expect(serviceProxyTarget).not.toHaveBeenCalled();
  });

  it("surfaces kubeconfig resolution failures as 4xx", async () => {
    serviceProxyTarget.mockRejectedValue(new Error("unknown context: nope"));
    const res = await POST(
      request({ url: "svc://default/demo-gateway:80/v1", body: {} }),
    );
    expect(res.status).toBe(403);
  });

  it("reports network errors as ok:false with the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );
    const res = await POST(request({ url: "http://10.0.0.1/v1", body: {} }));
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.status).toBe(0);
    expect(payload.body).toContain("ECONNREFUSED");
  });
});
