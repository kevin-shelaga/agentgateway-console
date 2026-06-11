"use client";

import { Activity, Coins, Gauge } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { AreaChart } from "@/components/area-chart";
import { ClusterUnreachable, PageHeader, ResourceError } from "@/components/page-states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useLlmMetrics } from "@/lib/usage-client";
import { allSeries, computeRates, groupBy, sumPoints } from "@/lib/usage-metrics";

const TOKENS = "agentgateway_gen_ai_client_token_usage_sum";
const LLM_REQUESTS = "agentgateway_gen_ai_client_token_usage_count";
const REQUESTS = "agentgateway_requests_total";
const DURATION_SUM = "agentgateway_request_duration_seconds_sum";
const DURATION_COUNT = "agentgateway_request_duration_seconds_count";

function fmtPerSec(v: number): string {
  if (v >= 10) return `${Math.round(v)}/s`;
  if (v >= 1) return `${v.toFixed(1)}/s`;
  if (v === 0) return "0/s";
  return `${v.toFixed(2)}/s`;
}

function fmtMs(seconds: number): string {
  const ms = seconds * 1000;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function statusClass(status: string): string {
  if (/^[0-9]/.test(status)) return `${status[0]}xx`;
  return status;
}

function RateBars({
  entries,
  format = fmtPerSec,
}: {
  entries: Array<{ key: string; perSecond: number }>;
  format?: (v: number) => string;
}) {
  const max = Math.max(1e-9, ...entries.map((e) => e.perSecond));
  return (
    <ul className="space-y-3">
      {entries.map(({ key, perSecond }, i) => (
        <li key={key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="k8s-id min-w-0 truncate font-medium">{key}</span>
            <span className="text-muted-foreground tabular-nums">{format(perSecond)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(perSecond / max) * 100}%`, background: `var(--chart-${(i % 5) + 1})` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function UsagePage() {
  const { data, error, dataUpdatedAt } = useLlmMetrics();

  // Recompute on every poll (dataUpdatedAt changes), reading the module store.
  const view = useMemo(() => {
    void dataUpdatedAt;
    const tokenRates = computeRates(TOKENS);
    const tokenSeries = allSeries(TOKENS);
    const byType = (type: string) =>
      sumPoints(tokenSeries.filter((s) => s.labels.gen_ai_token_type === type));
    const requestRates = computeRates(REQUESTS);
    const durSum = sumPoints(allSeries(DURATION_SUM));
    const durCount = sumPoints(allSeries(DURATION_COUNT));
    const latency = durSum.map((p, i) => ({
      t: p.t,
      v: durCount[i] && durCount[i].v > 0 ? p.v / durCount[i].v : 0,
    }));
    return {
      hasTokens: tokenRates.length > 0,
      tokensIn: byType("input"),
      tokensOut: byType("output"),
      tokensByModel: groupBy(tokenRates, "gen_ai_request_model"),
      tokensByProvider: groupBy(tokenRates, "gen_ai_system"),
      llmReqRate: computeRates(LLM_REQUESTS).reduce((a, r) => a + r.perSecond, 0),
      requestsTotal: sumPoints(allSeries(REQUESTS)),
      byGateway: groupBy(requestRates, "gateway"),
      byStatus: groupBy(
        requestRates.map((r) => ({ ...r, labels: { class: statusClass(r.labels.status ?? "unknown") } })),
        "class",
      ),
      latency,
      currentLatency: latency.at(-1)?.v ?? 0,
    };
  }, [dataUpdatedAt]);

  const apiError = error instanceof ApiError ? error.parsed : null;

  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <Gauge className="size-5 text-primary" />
            Usage
            {data && (
              <Badge variant="secondary" className="font-normal tabular-nums">
                {`${data.scraped.length} ${data.scraped.length === 1 ? "proxy" : "proxies"} · summed`}
              </Badge>
            )}
          </span>
        }
        description="Token consumption and traffic, scraped live from every proxy replica and summed — trends build while the console is open (15s polls)"
      />
      {data && data.failed.length > 0 && (
        <p className="text-xs text-warning">
          {data.failed.length} pod(s) could not be scraped: {data.failed.join(", ")}
        </p>
      )}

      {apiError ? (
        apiError.status >= 500 ? (
          <ClusterUnreachable error={apiError.message} />
        ) : (
          <ResourceError error={apiError} />
        )
      ) : (
        <>
          {/* Tokens */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <Coins className="size-4 text-chart-1" />
              <CardTitle className="text-sm">LLM tokens</CardTitle>
              {view.hasTokens && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {fmtPerSec(view.llmReqRate)} LLM requests
                </span>
              )}
            </CardHeader>
            <CardContent>
              {!view.hasTokens ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No token metrics yet — they appear when traffic flows through{" "}
                  <Link href="/resources/backends" className="text-primary hover:underline">
                    AI backends
                  </Link>
                  . Static/MCP backends don&apos;t emit token usage.
                </p>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="space-y-4">
                    <AreaChart points={view.tokensIn} label="input tokens" format={fmtPerSec} className="text-chart-1" height={140} />
                    <AreaChart points={view.tokensOut} label="output tokens" format={fmtPerSec} className="text-chart-2" height={140} />
                  </div>
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                        Tokens/s by model
                      </p>
                      <RateBars entries={view.tokensByModel.slice(0, 8)} />
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                        By provider
                      </p>
                      <RateBars entries={view.tokensByProvider.slice(0, 5)} />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Traffic */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Activity className="size-4 text-chart-3" />
                <CardTitle className="text-sm">Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <AreaChart points={view.requestsTotal} label="requests" format={fmtPerSec} className="text-chart-3" height={140} />
                <div>
                  <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                    By status
                  </p>
                  <RateBars entries={view.byStatus.slice(0, 6)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Gauge className="size-4 text-chart-5" />
                <CardTitle className="text-sm">Latency &amp; gateways</CardTitle>
                <span className="ml-auto font-mono text-xs tabular-nums">
                  avg {fmtMs(view.currentLatency)}
                </span>
              </CardHeader>
              <CardContent className="space-y-5">
                <AreaChart points={view.latency} label="latency" format={fmtMs} className="text-chart-5" height={140} />
                <div>
                  <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                    Requests/s by gateway
                  </p>
                  <RateBars entries={view.byGateway.slice(0, 6)} />
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
