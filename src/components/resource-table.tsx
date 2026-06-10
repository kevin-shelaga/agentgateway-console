"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  FileCode2,
  Funnel,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api-client";
import { formatAge } from "@/lib/format";
import { useDeleteResource } from "@/lib/hooks";
import {
  applyColumnFilters,
  columnFacets,
  sortResources,
  STATUS_FILTER_KEY,
  type ColumnFilters,
  type Facet,
  type SortState,
} from "@/lib/table-sort";
import type { K8sResource, ResourceDescriptor } from "@/lib/types";
import { cn } from "@/lib/utils";

function detailHref(desc: ResourceDescriptor, res: K8sResource): string {
  const ns = desc.scope === "Cluster" ? "_cluster" : (res.metadata.namespace ?? "default");
  return `/resources/${desc.id}/${ns}/${res.metadata.name}`;
}

function CellValue({ value, mono }: { value: string | string[] | undefined; mono?: boolean }) {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="flex max-w-72 flex-wrap gap-1">
        {value.slice(0, 3).map((v, i) => (
          <Badge key={i} variant="secondary" className={cn("font-normal", mono && "font-mono")}>
            {v}
          </Badge>
        ))}
        {value.length > 3 && (
          <Badge variant="outline" className="font-normal">
            +{value.length - 3}
          </Badge>
        )}
      </span>
    );
  }
  return <span className={cn("truncate", mono && "k8s-id")}>{value}</span>;
}

/** Module-level so React keeps header DOM (and open dropdowns) across re-renders. */
function SortableHead({
  label,
  sortKey,
  filterKey,
  facets,
  className,
  sort,
  filters,
  onSort,
  onToggleFilter,
}: {
  label: string;
  sortKey: string;
  filterKey?: string;
  facets?: Facet[];
  className?: string;
  sort: SortState | null;
  filters: ColumnFilters;
  onSort: (key: string) => void;
  onToggleFilter: (columnId: string, value: string) => void;
}) {
  const active = sort?.key === sortKey;
  const SortIcon = !active ? ChevronsUpDown : sort!.direction === "asc" ? ArrowUp : ArrowDown;
  const effectiveFilterKey = filterKey ?? sortKey;
  const selected = filters[effectiveFilterKey] ?? new Set<string>();
  const filterable = (facets?.length ?? 0) > 1 && (facets?.length ?? 0) <= 12;
  return (
    <TableHead className={className}>
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            "flex cursor-pointer items-center gap-1 rounded-sm hover:text-foreground",
            active && "text-foreground",
          )}
          aria-label={`Sort by ${label}`}
        >
          {label}
          <SortIcon className={cn("size-3", !active && "opacity-40")} />
        </button>
        {filterable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-sm p-0.5 hover:text-foreground",
                  selected.size > 0 ? "text-primary" : "opacity-40",
                )}
                aria-label={`Filter ${label}`}
              >
                <Funnel className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
              {facets!.map(({ value, count }) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={selected.has(value)}
                  onCheckedChange={() => onToggleFilter(effectiveFilterKey, value)}
                  onSelect={(e) => e.preventDefault()}
                  className="font-mono text-xs"
                >
                  <span className="truncate">{value}</span>
                  <span className="ml-auto pl-3 text-muted-foreground tabular-nums">{count}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
    </TableHead>
  );
}

export function ResourceTable({
  desc,
  items,
}: {
  desc: ResourceDescriptor;
  items: K8sResource[];
}) {
  const router = useRouter();
  const remove = useDeleteResource(desc);
  const [pendingDelete, setPendingDelete] = useState<K8sResource | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<ColumnFilters>({});

  function cycleSort(key: string) {
    setSort((prev) =>
      prev?.key !== key
        ? { key, direction: "asc" }
        : prev.direction === "asc"
          ? { key, direction: "desc" }
          : null,
    );
  }

  function toggleFilter(columnId: string, value: string) {
    setFilters((prev) => {
      const selected = new Set(prev[columnId] ?? []);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      return { ...prev, [columnId]: selected };
    });
  }

  const statusFacets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const res of items) {
      const state = desc.getStatus(res).state;
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return [...counts.entries()].map(([value, count]) => ({ value, count }));
  }, [items, desc]);

  const visible = useMemo(
    () => sortResources(applyColumnFilters(items, desc, filters), desc, sort),
    [items, desc, filters, sort],
  );
  const filtersActive = Object.values(filters).some((s) => s.size > 0);
  const headProps = { sort, filters, onSort: cycleSort, onToggleFilter: toggleFilter };

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { name, namespace } = pendingDelete.metadata;
    try {
      await remove.mutateAsync({ namespace, name });
      toast.success(`${desc.kind} ${name} deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.parsed.message : String(err));
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead label="Name" sortKey="name" {...headProps} />
              {desc.scope === "Namespaced" && (
                <SortableHead label="Namespace" sortKey="namespace" {...headProps} />
              )}
              {desc.listColumns.map((col) => (
                <SortableHead
                  key={col.id}
                  label={col.header}
                  sortKey={col.id}
                  facets={columnFacets(items, col)}
                  {...headProps}
                />
              ))}
              <SortableHead label="Status" sortKey="status" filterKey={STATUS_FILTER_KEY} facets={statusFacets} {...headProps} />
              <SortableHead label="Age" sortKey="age" className="w-20" {...headProps} />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && filtersActive && (
              <TableRow>
                <TableCell colSpan={desc.listColumns.length + 5} className="py-8 text-center">
                  <span className="text-sm text-muted-foreground">No rows match the filters. </span>
                  <button
                    type="button"
                    onClick={() => setFilters({})}
                    className="cursor-pointer text-sm text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                </TableCell>
              </TableRow>
            )}
            {visible.map((res) => {
              const status = desc.getStatus(res);
              const href = detailHref(desc, res);
              return (
                <TableRow
                  key={`${res.metadata.namespace ?? ""}/${res.metadata.name}`}
                  className="cursor-pointer"
                  onClick={() => router.push(href)}
                >
                  <TableCell>
                    <Link
                      href={href}
                      className="k8s-id font-medium text-foreground hover:text-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {res.metadata.name}
                    </Link>
                  </TableCell>
                  {desc.scope === "Namespaced" && (
                    <TableCell className="k8s-id text-muted-foreground">
                      {res.metadata.namespace}
                    </TableCell>
                  )}
                  {desc.listColumns.map((col) => (
                    <TableCell key={col.id}>
                      <CellValue value={col.accessor(res)} mono={col.mono} />
                    </TableCell>
                  ))}
                  <TableCell>
                    {status.message ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <StatusBadge state={status.state} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-96">{status.message}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <StatusBadge state={status.state} />
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatAge(res.metadata.creationTimestamp)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Row actions"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(href)}>
                          <FileCode2 className="size-4" /> View
                        </DropdownMenuItem>
                        {!desc.readOnly && (
                          <>
                            <DropdownMenuItem onClick={() => router.push(`${href}/edit`)}>
                              <Pencil className="size-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setPendingDelete(res)}
                            >
                              <Trash2 className="size-4" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {desc.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="k8s-id text-foreground">
                {pendingDelete?.metadata.namespace
                  ? `${pendingDelete.metadata.namespace}/`
                  : ""}
                {pendingDelete?.metadata.name}
              </span>{" "}
              from the cluster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
