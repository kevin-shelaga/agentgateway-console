"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getStoredContext } from "@/lib/api-client";
import { useKubeContext } from "@/lib/hooks";
import type { ParsedK8sError } from "@/lib/k8s/errors";

export const MANAGED_BY_LABEL = "agentgateway.dev/managed-by";
export const PROVIDER_LABEL = "agentgateway.dev/provider";

/** Metadata-only view of an API key secret — values never reach the browser. */
export interface LlmKeyMeta {
  name: string;
  namespace: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  managed: boolean;
}

export interface CreateLlmKeyArgs {
  name: string;
  namespace: string;
  apiKey: string;
  providerHint?: string;
}

const BASE = "/api/llm-keys";

/** Same wire conventions as api-client's request: context header + ApiError. */
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

function itemPath(namespace: string, name: string): string {
  return `${BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export async function listLlmKeys(namespace?: string): Promise<LlmKeyMeta[]> {
  const qs = namespace ? `?namespace=${encodeURIComponent(namespace)}` : "";
  const body = await request<{ items: LlmKeyMeta[] }>(`${BASE}${qs}`);
  return body.items;
}

export async function createLlmKey(args: CreateLlmKeyArgs): Promise<LlmKeyMeta> {
  return request<LlmKeyMeta>(BASE, { method: "POST", body: JSON.stringify(args) });
}

export async function rotateLlmKey(
  namespace: string,
  name: string,
  apiKey: string,
): Promise<LlmKeyMeta> {
  return request<LlmKeyMeta>(itemPath(namespace, name), {
    method: "PUT",
    body: JSON.stringify({ apiKey }),
  });
}

export async function deleteLlmKey(namespace: string, name: string): Promise<void> {
  await request(itemPath(namespace, name), { method: "DELETE" });
}

export function useLlmKeys(namespace?: string) {
  const { context } = useKubeContext();
  return useQuery({
    queryKey: ["llm-keys", context, namespace ?? ""],
    queryFn: () => listLlmKeys(namespace),
  });
}

function useInvalidateLlmKeys() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["llm-keys"] });
}

export function useCreateLlmKey() {
  const invalidate = useInvalidateLlmKeys();
  return useMutation({
    mutationFn: (args: CreateLlmKeyArgs) => createLlmKey(args),
    onSuccess: invalidate,
  });
}

export function useRotateLlmKey() {
  const invalidate = useInvalidateLlmKeys();
  return useMutation({
    mutationFn: ({ namespace, name, apiKey }: { namespace: string; name: string; apiKey: string }) =>
      rotateLlmKey(namespace, name, apiKey),
    onSuccess: invalidate,
  });
}

export function useDeleteLlmKey() {
  const invalidate = useInvalidateLlmKeys();
  return useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteLlmKey(namespace, name),
    onSuccess: invalidate,
  });
}
