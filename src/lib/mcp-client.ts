import { ApiError, getStoredContext } from "@/lib/api-client";
import type { ParsedK8sError } from "./k8s/errors";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const context = getStoredContext();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(context ? { "x-kube-context": context } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed: ParsedK8sError = body?.error ?? {
      status: res.status,
      reason: res.statusText || "Error",
      message: `request failed with status ${res.status}`,
      causes: [],
    };
    throw new ApiError(parsed);
  }
  return body as T;
}

export interface McpTestPayload {
  url: string;
  hostname?: string;
  authHeader?: { name: string; value: string };
  insecureTls?: boolean;
  action: "listTools" | "callTool";
  toolName?: string;
  args?: Record<string, unknown>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
}

export interface McpContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpTestResult {
  ok: boolean;
  durationMs: number;
  tools?: McpTool[];
  result?: { content: McpContentBlock[]; isError: boolean };
  error?: string;
}

export async function testMcp(payload: McpTestPayload): Promise<McpTestResult> {
  return request<McpTestResult>("/api/mcp-test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
