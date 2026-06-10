"use client";

import { ArrowRight, CheckCircle2, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { resourceIcon } from "@/components/icon-map";
import { ClusterUnreachable } from "@/components/page-states";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClusterInfo, useResourceList } from "@/lib/hooks";
import { backendType, getResource } from "@/lib/registry";
import type { K8sResource, ResourceDescriptor, StatusSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function detailHref(desc: ResourceDescriptor, res: K8sResource): string {
  const ns = desc.scope === "Cluster" ? "_cluster" : (res.metadata.namespace ?? "default");
  return `/resources/${desc.id}/${ns}/${res.metadata.name}`;
}

const BACKEND_TYPE_LABEL: Record<string, string> = {
  ai: "AI / LLM",
  mcp: "MCP",
  static: "Static",
  dynamicForwardProxy: "Forward proxy",
  aws: "AWS",
  a2a: "A2A",
  unknown: "Other",
};

function StatTile({
  desc,
  items,
  loading,
  index,
}: {
  desc: ResourceDescriptor;
  items: Array<{ res: K8sResource; status: StatusSummary }>;
  loading: boolean;
  index: number;
}) {
  const Icon = resourceIcon(desc.icon);
  const healthy = items.filter((i) => i.status.state === "Healthy").length;
  const degraded = items.filter((i) => i.status.state === "Degraded").length;
  const hasStatus = items.some((i) => i.status.conditions.length > 0);

  return (
    <Link
      href={`/resources/${desc.id}`}
      className="group animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <Card className="h-full gap-3 py-4 transition-colors group-hover:border-primary/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4">
          <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {desc.labelPlural}
          </CardTitle>
          <Icon className="size-4 text-primary" />
        </CardHeader>
        <CardContent className="px-4">
          {loading ? (
            <Skeleton className="h-8 w-14" />
          ) : (
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {items.length}
              </span>
              {hasStatus && (
                <span className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-success">
                    <span className="status-dot status-dot-healthy" /> {healthy}
                  </span>
                  {degraded > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <span className="status-dot status-dot-degraded" /> {degraded}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function Dashboard() {
  const { data: cluster } = useClusterInfo();

  const gatewaysDesc = getResource("gateways")!;
  const httproutesDesc = getResource("httproutes")!;
  const grpcroutesDesc = getResource("grpcroutes")!;
  const backendsDesc = getResource("backends")!;
  const policiesDesc = getResource("policies")!;

  const gateways = useResourceList(gatewaysDesc);
  const httproutes = useResourceList(httproutesDesc);
  const grpcroutes = useResourceList(grpcroutesDesc);
  const backends = useResourceList(backendsDesc);
  const policies = useResourceList(policiesDesc);

  const withStatus = (desc: ResourceDescriptor, items: K8sResource[] | undefined) =>
    (items ?? []).map((res) => ({ res, status: desc.getStatus(res) }));

  const gatewayItems = useMemo(() => withStatus(gatewaysDesc, gateways.data), [gateways.data, gatewaysDesc]);
  const routeItems = useMemo(
    () => [
      ...withStatus(httproutesDesc, httproutes.data),
      ...withStatus(grpcroutesDesc, grpcroutes.data),
    ],
    [httproutes.data, grpcroutes.data, httproutesDesc, grpcroutesDesc],
  );
  const backendItems = useMemo(() => withStatus(backendsDesc, backends.data), [backends.data, backendsDesc]);
  const policyItems = useMemo(() => withStatus(policiesDesc, policies.data), [policies.data, policiesDesc]);

  const attention = useMemo(() => {
    const all = [
      ...gatewayItems.map((i) => ({ ...i, desc: gatewaysDesc })),
      ...routeItems.map((i) => ({
        ...i,
        desc: i.res.kind === "GRPCRoute" ? grpcroutesDesc : httproutesDesc,
      })),
      ...backendItems.map((i) => ({ ...i, desc: backendsDesc })),
      ...policyItems.map((i) => ({ ...i, desc: policiesDesc })),
    ];
    return all.filter((i) => i.status.state === "Degraded");
  }, [gatewayItems, routeItems, backendItems, policyItems, gatewaysDesc, httproutesDesc, grpcroutesDesc, backendsDesc, policiesDesc]);

  const backendsByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { res } of backendItems) {
      const t = backendType(res);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [backendItems]);
  const backendMax = Math.max(1, ...backendsByType.map(([, n]) => n));

  const loading = gateways.isLoading;
  if (cluster && !cluster.connected) {
    return (
      <div className="p-6">
        <ClusterUnreachable error={cluster.error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="surface-grid -m-6 mb-0 flex flex-wrap items-end justify-between gap-3 border-b p-6 pb-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {cluster?.context ? (
              <>
                Cluster <span className="k8s-id text-foreground">{cluster.context}</span>
              </>
            ) : (
              "Cluster overview"
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/resources/backends/new">
              <Plus className="size-4" /> Backend
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/resources/httproutes/new">
              <Plus className="size-4" /> Route
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/resources/gateways/new">
              <Plus className="size-4" /> Gateway
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile desc={gatewaysDesc} items={gatewayItems} loading={loading} index={0} />
        <StatTile desc={httproutesDesc} items={routeItems} loading={httproutes.isLoading} index={1} />
        <StatTile desc={backendsDesc} items={backendItems} loading={backends.isLoading} index={2} />
        <StatTile desc={policiesDesc} items={policyItems} loading={policies.isLoading} index={3} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Gateway fleet */}
        <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 xl:col-span-3" style={{ animationDelay: "280ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Gateway fleet</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
              <Link href="/resources/gateways">
                All gateways <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : gatewayItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No gateways yet.{" "}
                <Link href="/resources/gateways/new" className="text-primary hover:underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {gatewayItems.map(({ res, status }) => {
                  const spec = (res.spec ?? {}) as Record<string, unknown>;
                  const listeners = Array.isArray(spec.listeners) ? spec.listeners : [];
                  const addrs = ((res.status as Record<string, unknown> | undefined)?.addresses ?? []) as Array<Record<string, unknown>>;
                  return (
                    <li key={`${res.metadata.namespace}/${res.metadata.name}`}>
                      <Link
                        href={detailHref(gatewaysDesc, res)}
                        className="flex items-center gap-3 py-2.5 transition-colors hover:bg-accent/40"
                      >
                        <StatusBadge state={status.state} label="" />
                        <span className="min-w-0">
                          <span className="k8s-id block truncate font-medium">
                            {res.metadata.name}
                          </span>
                          <span className="k8s-id block truncate text-[11px] text-muted-foreground">
                            {res.metadata.namespace}
                          </span>
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-1.5">
                          {listeners.slice(0, 3).map((l, i) => {
                            const x = l as Record<string, unknown>;
                            return (
                              <Badge key={i} variant="secondary" className="font-mono text-[10px] font-normal">
                                {String(x.protocol)}:{String(x.port)}
                              </Badge>
                            );
                          })}
                          {addrs[0]?.value !== undefined && (
                            <span className="k8s-id hidden text-xs text-muted-foreground sm:inline">
                              {String(addrs[0].value)}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Backend breakdown */}
        <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 xl:col-span-2" style={{ animationDelay: "350ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Backends by type</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
              <Link href="/resources/backends">
                All backends <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {backends.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : backendsByType.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No backends yet.{" "}
                <Link href="/resources/backends/new" className="text-primary hover:underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-3">
                {backendsByType.map(([type, count], i) => (
                  <li key={type} className="space-y-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium">{BACKEND_TYPE_LABEL[type] ?? type}</span>
                      <span className="text-muted-foreground tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(count / backendMax) * 100}%`,
                          background: `var(--chart-${(i % 5) + 1})`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Needs attention */}
      <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500" style={{ animationDelay: "420ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            Needs attention
            {attention.length > 0 && (
              <Badge variant="destructive" className="tabular-nums">
                {attention.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" />
              Every resource with reported status is healthy.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {attention.map(({ res, status, desc }) => (
                <li key={`${res.kind}/${res.metadata.namespace}/${res.metadata.name}`}>
                  <Link
                    href={detailHref(desc, res)}
                    className={cn(
                      "flex items-start gap-3 py-2.5 transition-colors hover:bg-accent/40",
                    )}
                  >
                    <span className="status-dot status-dot-degraded mt-1.5" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="k8s-id font-medium">
                          {res.metadata.namespace ? `${res.metadata.namespace}/` : ""}
                          {res.metadata.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {res.kind}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {status.message}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
