"use client";

import { Activity, Coins, Gauge, Hammer, Shield, Timer, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AreaChart } from "@/components/area-chart";
import { ClusterUnreachable, PageHeader, ResourceError } from "@/components/page-states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useLlmMetrics } from "@/lib/usage-client";
import {
  allSeries,
  computeRates,
  groupBy,
  sessionTotalsBy,
  sliceWindow,
  sumPoints,
  sumTotals,
  totals,
} from "@/lib/usage-metrics";

const TOKENS = "agentgateway_gen_ai_client_token_usage_sum";
const LLM_REQUESTS = "agentgateway_gen_ai_client_token_usage_count";
const REQUESTS = "agentgateway_requests_total";
const DURATION_SUM = "agentgateway_request_duration_seconds_sum";
const DURATION_COUNT = "agentgateway_request_duration_seconds_count";
const TTFT_SUM = "agentgateway_gen_ai_server_time_to_first_token_sum";
const TTFT_COUNT = "agentgateway_gen_ai_server_time_to_first_token_count";
const TPOT_SUM = "agentgateway_gen_ai_server_time_per_output_token_sum";
const TPOT_COUNT = "agentgateway_gen_ai_server_time_per_output_token_count";
const MCP_REQUESTS = "agentgateway_mcp_requests_total";
const GUARDRAILS = "agentgateway_guardrail_checks_total";

/** Label added via AgentgatewayParameters `config.metrics.fields.add.user`. */
const USER_LABEL = "user";

/** Poll-interval choices in seconds. */
const POLL_OPTIONS = [5, 15, 30];

const WINDOWS = [
  { minutes: 5, label: "5m" },
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
];

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

function fmtCount(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1e3).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

function statusClass(status: string): string {
  if (/^[0-9]/.test(status)) return `${status[0]}xx`;
  return status;
}

/** Pointwise avg of two summed counter-rate series (sum/count histograms). */
function avgSeries(sum: Array<{ t: number; v: number }>, count: Array<{ t: number; v: number }>) {
  return sum.map((p, i) => ({
    t: p.t,
    v: count[i] && count[i].v > 0 ? p.v / count[i].v : 0,
  }));
}

/** Current avg from rates, falling back to the since-pod-start average. */
function currentAvg(sumName: string, countName: string): number | null {
  const sumRate = computeRates(sumName).reduce((a, r) => a + r.perSecond, 0);
  const countRate = computeRates(countName).reduce((a, r) => a + r.perSecond, 0);
  if (countRate > 0) return sumRate / countRate;
  const lifeSum = sumTotals(totals(sumName)).lifetime;
  const lifeCount = sumTotals(totals(countName)).lifetime;
  if (lifeCount > 0) return lifeSum / lifeCount;
  return null;
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

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="mt-0.5 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">{label}</p>
          <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function UsagePage() {
  const [pollSec, setPollSec] = useState(15);
  const { data, error, dataUpdatedAt } = useLlmMetrics(pollSec * 1000);
  const [windowMin, setWindowMin] = useState(30);
  const windowMs = windowMin * 60_000;

  // Recompute on every poll (dataUpdatedAt changes), reading the module store.
  const view = useMemo(() => {
    void dataUpdatedAt;
    const tokenRates = computeRates(TOKENS);
    const tokenSeries = allSeries(TOKENS);
    const tokenTotals = totals(TOKENS);
    const byType = (type: string) =>
      sliceWindow(
        sumPoints(tokenSeries.filter((s) => s.labels.gen_ai_token_type === type)),
        windowMs,
      );
    const requestRates = computeRates(REQUESTS);
    const durSum = sumPoints(allSeries(DURATION_SUM));
    const durCount = sumPoints(allSeries(DURATION_COUNT));

    const isType = (type: string) => (l: Record<string, string>) => l.gen_ai_token_type === type;
    const tokensAll = sumTotals(tokenTotals);
    const tokensIn = sumTotals(tokenTotals, isType("input"));
    const tokensOut = sumTotals(tokenTotals, isType("output"));

    const ttft = currentAvg(TTFT_SUM, TTFT_COUNT);
    const secPerToken = currentAvg(TPOT_SUM, TPOT_COUNT);

    const userTokenRates = tokenRates.filter((r) => r.labels[USER_LABEL]);
    const userTokenTotals = tokenTotals.filter((t) => t.labels[USER_LABEL]);

    const mcpRates = computeRates(MCP_REQUESTS);
    const guardrailTotals = totals(GUARDRAILS);

    return {
      hasTokens: tokenRates.length > 0,
      tokensInPoints: byType("input"),
      tokensOutPoints: byType("output"),
      tokensByModel: groupBy(tokenRates, "gen_ai_request_model"),
      tokensByProvider: groupBy(tokenRates, "gen_ai_system"),
      tokensByRoute: groupBy(tokenRates, "route"),
      llmReqRate: computeRates(LLM_REQUESTS).reduce((a, r) => a + r.perSecond, 0),
      tokensAll,
      tokensIn,
      tokensOut,
      ttft,
      tokensPerSec: secPerToken && secPerToken > 0 ? 1 / secPerToken : null,
      hasUsers: userTokenTotals.length > 0,
      tokensByUser: sessionTotalsBy(userTokenTotals, USER_LABEL),
      tokenRateByUser: groupBy(userTokenRates, USER_LABEL),
      hasMcp: mcpRates.length > 0,
      mcpRate: mcpRates.reduce((a, r) => a + r.perSecond, 0),
      mcpByTool: groupBy(mcpRates, "resource"),
      mcpByServer: groupBy(mcpRates, "server"),
      hasGuardrails: guardrailTotals.length > 0,
      guardrailCounts: guardrailTotals
        .map((t) => ({
          key: `${t.labels.phase ?? "unknown"} · ${t.labels.action ?? "unknown"}`,
          perSecond: t.value,
        }))
        .sort((a, b) => b.perSecond - a.perSecond || a.key.localeCompare(b.key)),
      requestsTotal: sliceWindow(sumPoints(allSeries(REQUESTS)), windowMs),
      byGateway: groupBy(requestRates, "gateway"),
      byStatus: groupBy(
        requestRates.map((r) => ({ ...r, labels: { class: statusClass(r.labels.status ?? "unknown") } })),
        "class",
      ),
      latency: sliceWindow(avgSeries(durSum, durCount), windowMs),
      currentLatency: avgSeries(durSum, durCount).at(-1)?.v ?? 0,
    };
  }, [dataUpdatedAt, windowMs]);

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
        description="Token consumption and traffic, scraped live from every proxy replica and summed — trends build while the console is open"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
              Window
            </span>
            <div className="flex items-center gap-1 rounded-lg border p-0.5">
              {WINDOWS.map((w) => (
                <button
                  key={w.minutes}
                  type="button"
                  aria-pressed={windowMin === w.minutes}
                  onClick={() => setWindowMin(w.minutes)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    windowMin === w.minutes
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
              Refresh
            </span>
            <div className="flex items-center gap-1 rounded-lg border p-0.5">
              {POLL_OPTIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  aria-pressed={pollSec === seconds}
                  onClick={() => setPollSec(seconds)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    pollSec === seconds
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </div>
        </div>
        {data && data.failed.length > 0 && (
          <p className="text-xs text-warning">
            {data.failed.length} pod(s) could not be scraped: {data.failed.join(", ")}
          </p>
        )}
      </div>

      {apiError ? (
        apiError.status >= 500 ? (
          <ClusterUnreachable error={apiError.message} />
        ) : (
          <ResourceError error={apiError} />
        )
      ) : (
        <>
          {/* Totals + LLM latency stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<Coins className="size-4" />}
              label="Total tokens"
              value={fmtCount(view.tokensAll.lifetime)}
              sub={`in ${fmtCount(view.tokensIn.lifetime)} · out ${fmtCount(view.tokensOut.lifetime)} — since proxy start`}
            />
            <StatCard
              icon={<Activity className="size-4" />}
              label="Tokens this session"
              value={fmtCount(view.tokensAll.session)}
              sub={`in ${fmtCount(view.tokensIn.session)} · out ${fmtCount(view.tokensOut.session)} — while this page is open`}
            />
            <StatCard
              icon={<Timer className="size-4" />}
              label="Time to first token"
              value={view.ttft === null ? "—" : fmtMs(view.ttft)}
              sub="avg across models (streaming)"
            />
            <StatCard
              icon={<Zap className="size-4" />}
              label="Generation speed"
              value={view.tokensPerSec === null ? "—" : `${fmtCount(view.tokensPerSec)} tok/s`}
              sub="avg per output token (streaming)"
            />
          </div>

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
                    <AreaChart points={view.tokensInPoints} label="input tokens" format={fmtPerSec} className="text-chart-1" height={140} />
                    <AreaChart points={view.tokensOutPoints} label="output tokens" format={fmtPerSec} className="text-chart-2" height={140} />
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
                    <div>
                      <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                        By route
                      </p>
                      <RateBars entries={view.tokensByRoute.slice(0, 6)} />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-user attribution */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <Users className="size-4 text-chart-4" />
              <CardTitle className="text-sm">Tokens by user</CardTitle>
              {view.hasUsers && (
                <span className="ml-auto text-xs text-muted-foreground">session totals</span>
              )}
            </CardHeader>
            <CardContent>
              {!view.hasUsers ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No <code className="k8s-id">user</code> label on token metrics. Add a custom metric
                  field to your proxies via <code className="k8s-id">AgentgatewayParameters</code> —
                  e.g. <code className="k8s-id">{'user: jwt.sub'}</code> — to attribute tokens per
                  user. See the README&apos;s “Per-user metrics” section.
                </p>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                      Tokens this session
                    </p>
                    <RateBars
                      entries={view.tokensByUser.slice(0, 8).map((u) => ({ key: u.key, perSecond: u.total }))}
                      format={fmtCount}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                      Tokens/s now
                    </p>
                    <RateBars entries={view.tokenRateByUser.slice(0, 8)} />
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

          {/* MCP + guardrails */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Hammer className="size-4 text-chart-2" />
                <CardTitle className="text-sm">MCP tool calls</CardTitle>
                {view.hasMcp && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fmtPerSec(view.mcpRate)} total
                  </span>
                )}
              </CardHeader>
              <CardContent>
                {!view.hasMcp ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No MCP tool calls observed — they appear when traffic flows through MCP backends.
                  </p>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                        Calls/s by tool
                      </p>
                      <RateBars entries={view.mcpByTool.slice(0, 8)} />
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                        By server
                      </p>
                      <RateBars entries={view.mcpByServer.slice(0, 5)} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Shield className="size-4 text-chart-4" />
                <CardTitle className="text-sm">Guardrails</CardTitle>
              </CardHeader>
              <CardContent>
                {!view.hasGuardrails ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No guardrail activity — counts appear when prompt-guard policies run.
                  </p>
                ) : (
                  <div>
                    <p className="mb-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                      Checks since proxy start (phase · action)
                    </p>
                    <RateBars entries={view.guardrailCounts.slice(0, 8)} format={fmtCount} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
