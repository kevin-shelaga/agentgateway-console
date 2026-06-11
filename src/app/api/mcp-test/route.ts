import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NextRequest, NextResponse } from "next/server";
import { Agent } from "undici";
import { contextFrom, forbidden } from "@/lib/k8s/registry-server";
import { parseSvcUrl, serviceProxyTarget } from "@/lib/k8s/service-proxy";

export interface McpTestRequest {
  url: string;
  /** Route hostname the gateway matches on; sent as the Host header. */
  hostname?: string;
  /** Auth header forwarded to the gateway; never logged or echoed back. */
  authHeader?: { name: string; value: string };
  /** Accept self-signed gateway certs (common on raw LB IPs). */
  insecureTls?: boolean;
  action: "listTools" | "callTool";
  toolName?: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
}

const MAX_TIMEOUT_MS = 120_000;

/**
 * Server-side MCP test call: the browser can't reach gateway addresses
 * (CORS, private networks), so the BFF connects over MCP Streamable HTTP
 * and lists or calls tools. SSE-only servers are not supported (v1): their
 * 4xx/405 rejection of the streamable POST is surfaced as the error message.
 */
export async function POST(req: NextRequest) {
  let test: McpTestRequest;
  try {
    test = (await req.json()) as McpTestRequest;
  } catch {
    return forbidden("request body must be JSON");
  }

  if (test.action !== "listTools" && test.action !== "callTool") {
    return forbidden(`unknown action: ${String(test.action)}`);
  }
  if (test.action === "callTool" && !test.toolName) {
    return forbidden("toolName is required for callTool");
  }

  const headers: Record<string, string> = {};
  if (test.hostname) headers.host = test.hostname;
  if (test.authHeader?.name && test.authHeader.value) {
    headers[test.authHeader.name] = test.authHeader.value;
  }

  const timeoutMs = Math.min(test.timeoutMs ?? 60_000, MAX_TIMEOUT_MS);
  // undici extension; absent from the DOM fetch types — injected via a
  // custom fetch because the transport owns its own request lifecycle.
  let dispatcher = test.insecureTls
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;

  let target: URL;
  const svc = parseSvcUrl(test.url);
  if (svc) {
    // Gateway without a published address: go through the API-server proxy.
    if (test.authHeader?.name.toLowerCase() === "authorization" && test.authHeader.value) {
      return forbidden(
        "the API-server proxy consumes the Authorization header; use a different header name (e.g. x-api-key) or a direct gateway address",
      );
    }
    try {
      const proxied = await serviceProxyTarget(contextFrom(req), svc, test.insecureTls);
      target = new URL(proxied.url);
      Object.assign(headers, proxied.headers);
      delete headers.host; // the API server routes by its own host
      dispatcher = proxied.dispatcher;
    } catch (err) {
      return forbidden(err instanceof Error ? err.message : String(err));
    }
  } else {
    try {
      target = new URL(test.url);
    } catch {
      return forbidden(`invalid url: ${test.url}`);
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return forbidden("only http(s) and svc:// urls are supported");
    }
  }

  const insecureFetch = dispatcher
    ? (url: string | URL, init?: RequestInit) =>
        fetch(url, { ...init, ...({ dispatcher } as object) })
    : undefined;

  const transport = new StreamableHTTPClientTransport(target, {
    requestInit: { headers },
    fetch: insecureFetch,
  });
  const client = new Client({ name: "agentgateway-console", version: "0.1.0" });

  const started = performance.now();
  try {
    await client.connect(transport, { timeout: timeoutMs });
    if (test.action === "listTools") {
      const { tools } = await client.listTools(undefined, { timeout: timeoutMs });
      const durationMs = Math.round(performance.now() - started);
      return NextResponse.json({
        ok: true,
        durationMs,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    }
    const result = await client.callTool(
      { name: test.toolName!, arguments: test.args ?? {} },
      undefined,
      { timeout: timeoutMs },
    );
    const durationMs = Math.round(performance.now() - started);
    return NextResponse.json({
      ok: true,
      durationMs,
      result: { content: result.content ?? [], isError: result.isError === true },
    });
  } catch (err) {
    const durationMs = Math.round(performance.now() - started);
    const message =
      err instanceof Error
        ? (err.cause instanceof Error ? `${err.message}: ${err.cause.message}` : err.message)
        : String(err);
    return NextResponse.json({ ok: false, durationMs, error: message });
  } finally {
    await transport.close().catch(() => {});
  }
}
