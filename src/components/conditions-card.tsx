import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAge } from "@/lib/format";
import type { ScopedCondition } from "@/lib/types";
import { cn } from "@/lib/utils";

function conditionTone(c: ScopedCondition): string {
  const negative = ["Conflicted", "Degraded", "OverlappingTLSConfig"].includes(c.type);
  const failing = negative ? c.status === "True" : c.status === "False";
  if (failing) return "status-dot-degraded";
  if (c.status === "Unknown") return "status-dot-pending";
  return "status-dot-healthy";
}

export function ConditionsCard({ conditions }: { conditions: ScopedCondition[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Conditions</CardTitle>
      </CardHeader>
      <CardContent>
        {conditions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conditions reported.</p>
        ) : (
          <ul className="space-y-3">
            {conditions.map((c, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={cn("status-dot mt-1.5", conditionTone(c))} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">{c.type}</span>
                    {c.scope && (
                      <span className="k8s-id text-xs text-muted-foreground">{c.scope}</span>
                    )}
                    {c.reason && c.reason !== c.type && (
                      <span className="text-xs text-muted-foreground">{c.reason}</span>
                    )}
                    {c.lastTransitionTime && (
                      <span className="ml-auto text-xs text-muted-foreground/70 tabular-nums">
                        {formatAge(c.lastTransitionTime)} ago
                      </span>
                    )}
                  </div>
                  {c.message && (
                    <p className="mt-0.5 text-xs break-words text-muted-foreground">{c.message}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
