"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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

/** Keep roughly this much streamed log text in memory (~2–4k lines). */
const MAX_BUFFER_CHARS = 400_000;
const RECONNECT_DELAY_MS = 3_000;

export type LogStreamStatus = "connecting" | "streaming" | "reconnecting" | "stopped";

/**
 * Live log tail over a chunked fetch. Reconnects automatically while
 * enabled (pod restarts, kubelet timeouts); buffer is size-capped.
 */
export function useLogStream(
  namespace: string,
  name: string,
  options: { container?: string; tailLines: number; enabled: boolean },
) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<LogStreamStatus>("stopped");
  const [error, setError] = useState<string | null>(null);
  // Identity of the current stream config; bump to force-clear the buffer.
  const generation = useRef(0);

  const { container, tailLines, enabled } = options;

  useEffect(() => {
    if (!enabled) {
      setStatus("stopped");
      return;
    }
    const gen = ++generation.current;
    const abort = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    setText("");
    setError(null);

    async function connect() {
      setStatus((prev) => (prev === "streaming" ? "reconnecting" : "connecting"));
      const qs = new URLSearchParams({ tailLines: String(tailLines) });
      if (container) qs.set("container", container);
      const context = getStoredContext();
      try {
        const res = await fetch(
          `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs/stream?${qs}`,
          { signal: abort.signal, headers: context ? { "x-kube-context": context } : {} },
        );
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? `stream failed with status ${res.status}`);
        }
        setStatus("streaming");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setText((prev) => {
            const next = prev + chunk;
            return next.length > MAX_BUFFER_CHARS ? next.slice(-MAX_BUFFER_CHARS) : next;
          });
        }
        // Upstream ended (pod rotated, kubelet timeout) — retry while enabled.
        if (!abort.signal.aborted && generation.current === gen) {
          setStatus("reconnecting");
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      } catch (err) {
        if (abort.signal.aborted || generation.current !== gen) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("reconnecting");
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    }

    void connect();
    return () => {
      abort.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [namespace, name, container, tailLines, enabled]);

  return { text, status, error };
}

export function usePodLogs(
  namespace: string,
  name: string,
  options: { container?: string; tailLines: number; autoRefresh: boolean; enabled?: boolean },
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
    enabled: options.enabled ?? true,
  });
}
