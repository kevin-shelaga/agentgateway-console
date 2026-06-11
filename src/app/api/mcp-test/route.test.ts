import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  clientClose: vi.fn(),
  transport: vi.fn(),
  transportClose: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    connect = mocks.connect;
    listTools = mocks.listTools;
    callTool = mocks.callTool;
    close = mocks.clientClose;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    close = mocks.transportClose;
    constructor(url: URL, opts: unknown) {
      mocks.transport(url, opts);
    }
  },
}));

import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://console.local/api/mcp-test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue(undefined);
  mocks.transportClose.mockResolvedValue(undefined);
});

describe("POST /api/mcp-test", () => {
  it("rejects non-JSON bodies, non-http(s) urls, and malformed actions", async () => {
    const bad = new NextRequest("http://console.local/api/mcp-test", {
      method: "POST",
      body: "not json",
    });
    expect((await POST(bad)).status).toBe(403);
    expect((await POST(request({ url: "ftp://x", action: "listTools" }))).status).toBe(403);
    expect((await POST(request({ url: "::bad::", action: "listTools" }))).status).toBe(403);
    expect((await POST(request({ url: "http://gw/mcp", action: "nope" }))).status).toBe(403);
    expect((await POST(request({ url: "http://gw/mcp", action: "callTool" }))).status).toBe(403);
  });

  it("rejects gateway-bound Authorization headers on svc:// urls", async () => {
    const res = await POST(
      request({
        url: "svc://default/demo-gateway:80/mcp",
        action: "listTools",
        authHeader: { name: "Authorization", value: "Bearer sk" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("connects with Host + auth headers and returns the tool list with latency", async () => {
    mocks.listTools.mockResolvedValue({
      tools: [
        {
          name: "fetch_url",
          description: "Fetch a URL",
          inputSchema: { type: "object", properties: { url: { type: "string" } } },
        },
      ],
    });

    const res = await POST(
      request({
        url: "http://4.229.185.215/mcp",
        hostname: "mcp.example.com",
        authHeader: { name: "Authorization", value: "Bearer sk-test" },
        action: "listTools",
      }),
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(payload.tools).toEqual([
      {
        name: "fetch_url",
        description: "Fetch a URL",
        inputSchema: { type: "object", properties: { url: { type: "string" } } },
      },
    ]);

    const [url, opts] = mocks.transport.mock.calls[0] as [URL, Record<string, unknown>];
    expect(url.href).toBe("http://4.229.185.215/mcp");
    expect((opts.requestInit as RequestInit).headers).toEqual({
      host: "mcp.example.com",
      Authorization: "Bearer sk-test",
    });
    expect(typeof opts.fetch).toBe("function"); // SSRF-guarded fetch is always injected
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.transportClose).toHaveBeenCalledOnce();
  });

  it("calls the tool with arguments and returns its content blocks", async () => {
    mocks.callTool.mockResolvedValue({
      content: [{ type: "text", text: "fetched 5 bytes" }],
      isError: false,
    });

    const res = await POST(
      request({
        url: "https://gw/mcp",
        insecureTls: true,
        action: "callTool",
        toolName: "fetch_url",
        args: { url: "https://example.com" },
      }),
    );
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.result).toEqual({
      content: [{ type: "text", text: "fetched 5 bytes" }],
      isError: false,
    });
    expect(mocks.callTool).toHaveBeenCalledWith(
      { name: "fetch_url", arguments: { url: "https://example.com" } },
      undefined,
      { timeout: 60_000 },
    );
    // insecureTls injects a custom fetch carrying the undici dispatcher.
    const [, opts] = mocks.transport.mock.calls[0] as [URL, Record<string, unknown>];
    expect(typeof opts.fetch).toBe("function");
    expect(mocks.transportClose).toHaveBeenCalledOnce();
  });

  it("reports connection failures as ok:false and still closes the transport", async () => {
    mocks.connect.mockRejectedValue(
      new Error("Error POSTing to endpoint (HTTP 405)", { cause: new Error("method not allowed") }),
    );
    const res = await POST(request({ url: "http://gw/mcp", action: "listTools" }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(false);
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(payload.error).toBe("Error POSTing to endpoint (HTTP 405): method not allowed");
    expect(mocks.transportClose).toHaveBeenCalledOnce();
  });
});
