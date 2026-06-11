"use client";

import { Plus, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useMemo, useState } from "react";
import { resourceIcon } from "@/components/icon-map";
import { NamespaceFilter } from "@/components/namespace-filter";
import {
  ClusterUnreachable,
  CrdNotInstalled,
  EmptyState,
  PageHeader,
  ResourceError,
  TableSkeleton,
} from "@/components/page-states";
import { ResourceTable } from "@/components/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { useResourceList } from "@/lib/hooks";
import { getResource } from "@/lib/registry";

export default function ResourceListPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = use(params);
  const desc = getResource(kind);
  if (!desc || desc.readOnly) notFound();

  const [namespace, setNamespace] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch, isRefetching } = useResourceList(desc, namespace);

  const items = useMemo(() => {
    const all = data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(
      (r) =>
        r.metadata.name.toLowerCase().includes(q) ||
        (r.metadata.namespace ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const Icon = resourceIcon(desc.icon);
  const apiError = error instanceof ApiError ? error.parsed : null;
  const unreachable = apiError && (apiError.status >= 500 || apiError.status === 0);

  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <Icon className="size-5 text-primary" />
            {desc.labelPlural}
            {data && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">
                {items.length}
              </span>
            )}
          </span>
        }
        description={desc.description}
      >
        <Button asChild size="sm">
          <Link href={`/resources/${desc.id}/new`}>
            <Plus className="size-4" />
            Create {desc.label}
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {desc.scope === "Namespaced" && (
          <NamespaceFilter value={namespace} onChange={setNamespace} />
        )}
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${desc.labelPlural.toLowerCase()}…`}
            className="h-8 w-64 pl-8 text-xs"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => refetch()}
          aria-label="Refresh"
        >
          <RefreshCw className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : unreachable ? (
        <ClusterUnreachable error={apiError.message} />
      ) : apiError?.status === 404 ? (
        <CrdNotInstalled desc={desc} />
      ) : apiError ? (
        <ResourceError error={apiError} />
      ) : items.length === 0 ? (
        search ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No matches for “{search}”.
          </p>
        ) : (
          <EmptyState desc={desc} />
        )
      ) : (
        <ResourceTable desc={desc} items={items} />
      )}
    </div>
  );
}
