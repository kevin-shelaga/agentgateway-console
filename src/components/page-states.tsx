"use client";

import { Plus, Unplug } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ParsedK8sError } from "@/lib/k8s/errors";
import type { ResourceDescriptor } from "@/lib/types";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function ClusterUnreachable({ error }: { error?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <Unplug className="size-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">Cluster unreachable</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {error ??
            "The Kubernetes API did not respond. Check your kubeconfig, VPN, or selected context (bottom of the sidebar)."}
        </p>
      </div>
    </div>
  );
}

export function ResourceError({ error }: { error: ParsedK8sError }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
      <p className="font-medium text-destructive">
        {error.reason} ({error.status})
      </p>
      <p className="mt-1 text-muted-foreground">{error.message}</p>
    </div>
  );
}

export function EmptyState({ desc }: { desc: ResourceDescriptor }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-24 text-center">
      <div className="space-y-1">
        <p className="font-medium">No {desc.labelPlural.toLowerCase()} yet</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{desc.description}.</p>
      </div>
      {!desc.readOnly && (
        <Button asChild size="sm">
          <Link href={`/resources/${desc.id}/new`}>
            <Plus className="size-4" />
            Create {desc.label}
          </Link>
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" style={{ opacity: 1 - i * 0.13 }} />
      ))}
    </div>
  );
}
