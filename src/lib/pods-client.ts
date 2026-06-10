"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError, getStoredContext } from "./api-client";
import { useKubeContext } from "./hooks";
import type { ParsedK8sError } from "./k8s/errors";

export interface PodContainer {
  name: string;
  image?: string;
  ready: boolean;
  restartCount: number;
  state: string;
}

export interface PodDetail {
  name: string;
  namespace: string;
  role: "proxy" | "controlplane";
  gateway?: string;
  phase: string;
  ready: string;
  restarts: number;
  node?: string;
  startTime?: string;
  labels?: Record<string, string>;
  containers: PodContainer[];
}

async function request<T>(path: string): Promise<T> {
  const context = getStoredContext();
  const res = await fetch(path, {
    headers: context ? { "x-kube-context": context } : {},
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

export function usePodDetail(namespace: string, name: string) {
  const { context } = useKubeContext();
  return useQuery({
    queryKey: ["pod", context, namespace, name],
    queryFn: () =>
      request<PodDetail>(
        `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
      ),
    refetchInterval: 15_000,
  });
}

export function usePodLogs(
  namespace: string,
  name: string,
  options: { container?: string; tailLines: number; autoRefresh: boolean },
) {
  const { context } = useKubeContext();
  const qs = new URLSearchParams({ tailLines: String(options.tailLines) });
  if (options.container) qs.set("container", options.container);
  return useQuery({
    queryKey: ["pod-logs", context, namespace, name, options.container ?? "", options.tailLines],
    queryFn: () =>
      request<{ logs: string; container: string | null }>(
        `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs?${qs}`,
      ),
    refetchInterval: options.autoRefresh ? 5_000 : false,
  });
}
