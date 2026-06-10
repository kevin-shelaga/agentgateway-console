"use client";

import { ArrowDownToLine, Cpu, MemoryStick, RefreshCw, ScrollText } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { AreaChart } from "@/components/area-chart";
import {
  ClusterUnreachable,
  PageHeader,
  ResourceError,
  TableSkeleton,
} from "@/components/page-states";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import { formatAge } from "@/lib/format";
import { useInfra } from "@/lib/hooks";
import { getHistory } from "@/lib/metrics-history";
import { useLogStream, usePodDetail, usePodLogs } from "@/lib/pods-client";
import { formatCpu, formatMemory } from "@/lib/quantity";
import type { HealthState } from "@/lib/types";

const TAIL_OPTIONS = [100, 500, 1000, 2000];

function podHealth(phase: string, ready: string): HealthState {
  if (phase === "Pending") return "Pending";
  const [r, t] = ready.split("/").map(Number);
  return phase === "Running" && r === t ? "Healthy" : "Degraded";
}

export default function PodDetailPage({
  params,
}: {
  params: Promise<{ namespace: string; name: string }>;
}) {
  const { namespace: nsParam, name: nameParam } = use(params);
  const namespace = decodeURIComponent(nsParam);
  const name = decodeURIComponent(nameParam);

  const { data: pod, isLoading, error } = usePodDetail(namespace, name);
  // Keeps the shared metrics history fed while this page is open.
  const infra = useInfra();
  const history = getHistory(`${namespace}/${name}`);

  // Requests/limits give the charts their context lines.
  const infraPod = infra.data?.pods.find((p) => p.namespace === namespace && p.name === name);
  const cpuRefs = [
    ...(infraPod?.cpuRequestMillis ? [{ value: infraPod.cpuRequestMillis, label: "request" }] : []),
    ...(infraPod?.cpuLimitMillis ? [{ value: infraPod.cpuLimitMillis, label: "limit" }] : []),
  ];
  const memRefs = [
    ...(infraPod?.memoryRequestBytes
      ? [{ value: infraPod.memoryRequestBytes, label: "request" }]
      : []),
    ...(infraPod?.memoryLimitBytes ? [{ value: infraPod.memoryLimitBytes, label: "limit" }] : []),
  ];

  const [container, setContainer] = useState<string>("");
  const [tailLines, setTailLines] = useState(500);
  const [following, setFollowing] = useState(true);
  // Following uses a live chunked stream; otherwise a one-shot tail fetch.
  const stream = useLogStream(namespace, name, {
    container: container || undefined,
    tailLines,
    enabled: following,
  });
  const logs = usePodLogs(namespace, name, {
    container: container || undefined,
    tailLines,
    autoRefresh: false,
    enabled: !following,
  });
  const logText = following ? stream.text : (logs.data?.logs ?? "");

  // Stick to the bottom on new logs unless the user scrolled up.
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [logText]);

  const apiError = error instanceof ApiError ? error.parsed : null;
  const metricsAvailable = infra.data?.metricsAvailable ?? false;

  function downloadLogs() {
    const blob = new Blob([logText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${namespace}_${name}${container ? `_${container}` : ""}.log`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="k8s-id">{namespace}</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage className="k8s-id">{name}</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {isLoading ? (
        <TableSkeleton />
      ) : apiError && apiError.status >= 500 ? (
        <ClusterUnreachable error={apiError.message} />
      ) : apiError ? (
        <ResourceError error={apiError} />
      ) : pod ? (
        <>
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono">{pod.name}</span>
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {pod.role === "proxy" ? "proxy · data plane" : "control plane"}
                </Badge>
                <StatusBadge state={podHealth(pod.phase, pod.ready)} />
              </span>
            }
            description={
              <span className="flex flex-wrap items-center gap-x-2">
                {pod.phase} · {pod.ready} ready
                {pod.restarts > 0 && <span className="text-warning">· {pod.restarts} restarts</span>}
                {pod.startTime && <>· up {formatAge(pod.startTime)}</>}
                {pod.node && <span className="k8s-id">· {pod.node}</span>}
              </span>
            }
          >
            {pod.gateway && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/resources/gateways/${pod.namespace}/${pod.gateway}`}>
                  Gateway: <span className="k8s-id">{pod.gateway}</span>
                </Link>
              </Button>
            )}
          </PageHeader>

          {/* Usage graphs */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Cpu className="size-4 text-chart-1" />
                <CardTitle className="text-sm">CPU</CardTitle>
              </CardHeader>
              <CardContent>
                {metricsAvailable ? (
                  <AreaChart
                    samples={history}
                    metric="cpu"
                    format={formatCpu}
                    referenceLines={cpuRefs}
                    className="text-chart-1"
                  />
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    metrics-server not available
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <MemoryStick className="size-4 text-chart-3" />
                <CardTitle className="text-sm">Memory</CardTitle>
              </CardHeader>
              <CardContent>
                {metricsAvailable ? (
                  <AreaChart
                    samples={history}
                    metric="mem"
                    format={formatMemory}
                    referenceLines={memRefs}
                    className="text-chart-3"
                  />
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    metrics-server not available
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Logs */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ScrollText className="size-4 text-primary" />
                Logs
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {pod.containers.length > 1 && (
                  <Select value={container || pod.containers[0].name} onValueChange={setContainer}>
                    <SelectTrigger size="sm" className="w-44 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pod.containers.map((c) => (
                        <SelectItem key={c.name} value={c.name} className="font-mono text-xs">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={String(tailLines)} onValueChange={(v) => setTailLines(Number(v))}>
                  <SelectTrigger size="sm" className="w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAIL_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {n} lines
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={following}
                    onCheckedChange={setFollowing}
                    aria-label="Follow logs"
                  />
                  follow
                </label>
                {following && (
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className={
                        stream.status === "streaming"
                          ? "status-dot status-dot-healthy animate-pulse"
                          : "status-dot status-dot-pending animate-pulse"
                      }
                    />
                    <span className="text-muted-foreground">{stream.status}</span>
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => logs.refetch()}
                  disabled={following}
                  aria-label="Refresh logs"
                >
                  <RefreshCw className={`size-3.5 ${logs.isRefetching ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={downloadLogs}
                  disabled={!logText}
                  aria-label="Download logs"
                >
                  <ArrowDownToLine className="size-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!following && logs.isLoading ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Loading logs…</p>
              ) : !following && logs.error ? (
                <p className="py-4 text-xs text-destructive">
                  {logs.error instanceof ApiError ? logs.error.parsed.message : String(logs.error)}
                </p>
              ) : (
                <>
                  {following && stream.error && (
                    <p className="mb-2 text-xs text-warning">
                      stream interrupted ({stream.error}) — retrying…
                    </p>
                  )}
                  <pre
                    ref={logRef}
                    className="max-h-[480px] overflow-auto rounded-lg border bg-[oklch(0.1_0.01_298)] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90"
                  >
                    {logText ||
                      (following && stream.status !== "streaming"
                        ? "Connecting to log stream…"
                        : "No log output.")}
                  </pre>
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
