"use client";

import { Cpu, MemoryStick } from "lucide-react";
import Link from "next/link";
import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { InfraPod } from "@/lib/api-client";
import { formatAge } from "@/lib/format";
import { useInfra } from "@/lib/hooks";
import { getHistory, podKey } from "@/lib/metrics-history";
import { formatCpu, formatMemory } from "@/lib/quantity";
import { cn } from "@/lib/utils";

function podState(pod: InfraPod): "healthy" | "pending" | "degraded" {
  if (pod.phase === "Pending") return "pending";
  const [ready, total] = pod.ready.split("/").map(Number);
  if (pod.phase === "Running" && ready === total) return "healthy";
  return "degraded";
}

function PodRow({
  pod,
  metricsAvailable,
}: {
  pod: InfraPod;
  metricsAvailable: boolean;
}) {
  const state = podState(pod);
  const history = getHistory(podKey(pod));
  const samples = {
    cpu: history.map((s) => s.cpu),
    mem: history.map((s) => s.mem),
  };
  return (
    <li>
      <Link
        href={`/pods/${pod.namespace}/${pod.name}`}
        className="flex items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-accent/40"
      >
      <span
        className={cn(
          "status-dot shrink-0",
          state === "healthy" && "status-dot-healthy",
          state === "pending" && "status-dot-pending",
          state === "degraded" && "status-dot-degraded",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="k8s-id truncate text-xs font-medium">{pod.name}</span>
          {pod.gateway && <span className="text-[10px] text-primary">{pod.gateway}</span>}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {pod.phase} · {pod.ready} ready
          {pod.restarts > 0 && (
            <span className="text-warning"> · {pod.restarts} restarts</span>
          )}
          {pod.startTime && <> · up {formatAge(pod.startTime)}</>}
          {pod.node && <span className="hidden lg:inline"> · {pod.node}</span>}
        </span>
      </span>
      {metricsAvailable && (
        <span className="flex shrink-0 items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Cpu className="size-3 text-muted-foreground" />
            <span className="w-10 text-right font-mono text-[11px] tabular-nums">
              {pod.cpuMillis !== undefined ? formatCpu(pod.cpuMillis) : "—"}
            </span>
            <Sparkline samples={samples?.cpu ?? []} className="text-chart-1" />
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <MemoryStick className="size-3 text-muted-foreground" />
            <span className="w-12 text-right font-mono text-[11px] tabular-nums">
              {pod.memoryBytes !== undefined ? formatMemory(pod.memoryBytes) : "—"}
            </span>
            <Sparkline samples={samples?.mem ?? []} className="text-chart-3" />
          </span>
        </span>
      )}
      </Link>
    </li>
  );
}

/**
 * Runtime view: agentgateway data plane pods (one per Gateway) and control
 * plane pods, with usage trends accumulated client-side from metrics.k8s.io
 * polls while the dashboard is open.
 */
export function InfraPanel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { data, isLoading } = useInfra();

  const proxies = (data?.pods ?? [])
    .filter((p) => p.role === "proxy")
    .sort((a, b) => (a.gateway ?? a.name).localeCompare(b.gateway ?? b.name));
  const controlPlane = (data?.pods ?? []).filter((p) => p.role === "controlplane");

  return (
    <Card className={className} style={style}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Runtime</CardTitle>
        <span className="text-[11px] text-muted-foreground">
          {data?.metricsAvailable
            ? "live usage · 15s"
            : data
              ? "metrics-server not available — usage hidden"
              : ""}
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (data?.pods.length ?? 0) === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No agentgateway pods found — is agentgateway installed in this cluster?
          </p>
        ) : (
          <div className="grid gap-x-8 gap-y-4 xl:grid-cols-[2fr_1fr]">
            <div>
              <p className="mb-1 flex items-center gap-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                Proxies (data plane)
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {proxies.length}
                </Badge>
              </p>
              <ul className="divide-y divide-border/60">
                {proxies.map((pod) => (
                  <PodRow
                    key={podKey(pod)}
                    pod={pod}
                    metricsAvailable={!!data?.metricsAvailable}
                  />
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-2 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                Control plane
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {controlPlane.length}
                </Badge>
              </p>
              <ul className="divide-y divide-border/60">
                {controlPlane.map((pod) => (
                  <PodRow
                    key={podKey(pod)}
                    pod={pod}
                    metricsAvailable={!!data?.metricsAvailable}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
