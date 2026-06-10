"use client";

import { FileCode2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
              <TableHead>Name</TableHead>
              {desc.scope === "Namespaced" && <TableHead>Namespace</TableHead>}
              {desc.listColumns.map((col) => (
                <TableHead key={col.id}>{col.header}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              <TableHead className="w-16">Age</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((res) => {
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
                        <Button variant="ghost" size="icon" className="size-7">
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
