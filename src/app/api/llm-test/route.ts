import { NextRequest, NextResponse } from "next/server";
import { Agent } from "undici";
import { contextFrom, forbidden } from "@/lib/k8s/registry-server";
import { parseSvcUrl, serviceProxyTarget } from "@/lib/k8s/service-proxy";

export interface LlmTestRequest {
  url: string;
  /** Route hostname the gateway matches on; sent as the Host header. */
  hostname?: string;
  /** Auth header forwarded to the gateway; never logged or echoed back. */
  authHeader?: { name: string; value: string };
  body: unknown;
  /** Accept self-signed gateway certs (common on raw LB IPs). */
  insecureTls?: boolean;
  timeoutMs?: number;
}

const MAX_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 1_000_000;

/**
 * Server-side LLM test call: the browser can't reach gateway addresses
 * (CORS, private networks), so the BFF fires the chat completion and
 * returns status, latency, and the (size-capped) response body.
 */
export async function POST(req: NextRequest) {
  let test: LlmTestRequest;
  try {
    test = (await req.json()) as LlmTestRequest;
  } catch {
    return forbidden("request body must be JSON");
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (test.hostname) headers.host = test.hostname;
  if (test.authHeader?.name && test.authHeader.value) {
    headers[test.authHeader.name] = test.authHeader.value;
  }

  const timeoutMs = Math.min(test.timeoutMs ?? 60_000, MAX_TIMEOUT_MS);
  let dispatcher = test.insecureTls
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;

  let target: URL;
  const svc = parseSvcUrl(test.url);
  if (svc) {
    // Gateway without a published address: go through the API-server proxy.
    // The API server consumes Authorization for its own auth, so a
    // gateway-bound Authorization header can never arrive — fail loudly.
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

  const started = performance.now();
  try {
    const res = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify(test.body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
      // undici extension; absent from the DOM fetch types
      ...(dispatcher ? ({ dispatcher } as object) : {}),
    });
    const durationMs = Math.round(performance.now() - started);
    const text = (await res.text()).slice(0, MAX_RESPONSE_BYTES);
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // leave as text
    }
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      durationMs,
      contentType: res.headers.get("content-type"),
      body,
    });
  } catch (err) {
    const durationMs = Math.round(performance.now() - started);
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? (err.cause instanceof Error ? `${err.message}: ${err.cause.message}` : err.message)
          : String(err);
    return NextResponse.json({ ok: false, status: 0, statusText: "", durationMs, body: message });
  }
}
