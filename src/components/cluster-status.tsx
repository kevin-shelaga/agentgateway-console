"use client";

import { Check, ChevronsUpDown, Unplug } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClusterInfo, useContexts, useKubeContext } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Sidebar footer widget: connection dot, current context, context switcher. */
export function ClusterStatus() {
  const { data: cluster, isLoading } = useClusterInfo();
  const { data: contexts } = useContexts();
  const { context, setContext } = useKubeContext();

  const current = cluster?.context ?? context ?? contexts?.current ?? "—";
  const connected = cluster?.connected === true;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0">
        {isLoading ? (
          <span className="status-dot status-dot-unknown animate-pulse" />
        ) : connected ? (
          <span className="status-dot status-dot-healthy" />
        ) : (
          <Unplug className="size-3.5 text-destructive" />
        )}
        <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            {connected ? "Connected" : isLoading ? "Connecting" : "Unreachable"}
          </span>
          <span className="k8s-id truncate text-xs">{current}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Kubeconfig context
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(contexts?.contexts ?? []).map((name) => (
          <DropdownMenuItem
            key={name}
            onClick={() => setContext(name)}
            className="font-mono text-xs"
          >
            <Check className={cn("size-3.5", name === current ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{name}</span>
          </DropdownMenuItem>
        ))}
        {!connected && cluster?.error && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-destructive">{cluster.error}</div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
