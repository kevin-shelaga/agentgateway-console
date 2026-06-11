"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, getStoredContext } from "./api-client";
import { useKubeContext } from "./hooks";
import type { ParsedK8sError } from "./k8s/errors";
import type { PromSample } from "./prom-parse";
import { recordScrape } from "./usage-metrics";

export interface LlmMetricsResponse {
  scraped: string[];
  failed: string[];
  samples: PromSample[];
  at: number;
}

async function fetchLlmMetrics(): Promise<LlmMetricsResponse> {
  const context = getStoredContext();
  const res = await fetch("/api/metrics/llm", {
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
  return body as LlmMetricsResponse;
}

const POLL_MS = 15_000;

/** Polls the cluster-summed metrics and feeds the session rate history. */
export function useLlmMetrics() {
  const { context } = useKubeContext();
  const query = useQuery({
    queryKey: ["llm-metrics", context],
    queryFn: fetchLlmMetrics,
    refetchInterval: POLL_MS,
  });
  useEffect(() => {
    if (query.data) recordScrape(query.data.samples, query.data.at);
  }, [query.data]);
  return query;
}
