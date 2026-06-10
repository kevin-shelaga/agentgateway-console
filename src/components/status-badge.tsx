import type { HealthState } from "@/lib/types";
import { cn } from "@/lib/utils";

const DOT_CLASS: Record<HealthState, string> = {
  Healthy: "status-dot-healthy",
  Degraded: "status-dot-degraded",
  Pending: "status-dot-pending",
  Unknown: "status-dot-unknown",
};

const TEXT_CLASS: Record<HealthState, string> = {
  Healthy: "text-success",
  Degraded: "text-destructive",
  Pending: "text-warning",
  Unknown: "text-muted-foreground",
};

export function StatusBadge({
  state,
  label,
  className,
}: {
  state: HealthState;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <span className={cn("status-dot", DOT_CLASS[state])} />
      <span className={TEXT_CLASS[state]}>{label ?? state}</span>
    </span>
  );
}
