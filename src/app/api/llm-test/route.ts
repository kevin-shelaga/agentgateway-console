import { NextRequest, NextResponse } from "next/server";
import { Agent } from "undici";
import { forbidden } from "@/lib/k8s/registry-server";

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

  let target: URL;
  try {
    target = new URL(test.url);
  } catch {
    return forbidden(`invalid url: ${test.url}`);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return forbidden("only http(s) urls are supported");
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (test.hostname) headers.host = test.hostname;
  if (test.authHeader?.name && test.authHeader.value) {
    headers[test.authHeader.name] = test.authHeader.value;
  }

  const timeoutMs = Math.min(test.timeoutMs ?? 60_000, MAX_TIMEOUT_MS);
  const dispatcher = test.insecureTls
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;

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
