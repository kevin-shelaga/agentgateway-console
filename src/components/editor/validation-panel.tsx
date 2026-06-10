import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { ParsedK8sError } from "@/lib/k8s/errors";
import type { ValidationIssue } from "@/lib/validation";

export function ValidationPanel({
  schemaIssues,
  dryRunError,
  dryRunOk,
}: {
  schemaIssues: ValidationIssue[];
  dryRunError: ParsedK8sError | null;
  dryRunOk: boolean;
}) {
  if (schemaIssues.length === 0 && !dryRunError && !dryRunOk) return null;

  return (
    <div className="space-y-2">
      {schemaIssues.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-3.5 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-warning">
            <AlertTriangle className="size-3.5" />
            Schema validation ({schemaIssues.length})
          </p>
          <ul className="space-y-1">
            {schemaIssues.slice(0, 8).map((issue, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {issue.path && <span className="k8s-id text-foreground">{issue.path}</span>}{" "}
                {issue.message}
              </li>
            ))}
            {schemaIssues.length > 8 && (
              <li className="text-xs text-muted-foreground">
                …and {schemaIssues.length - 8} more
              </li>
            )}
          </ul>
        </div>
      )}

      {dryRunError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
            <ShieldAlert className="size-3.5" />
            Rejected by the API server (dry-run)
          </p>
          {dryRunError.causes.length > 0 ? (
            <ul className="space-y-1">
              {dryRunError.causes.map((cause, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {cause.field && <span className="k8s-id text-foreground">{cause.field}</span>}{" "}
                  {cause.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{dryRunError.message}</p>
          )}
        </div>
      )}

      {dryRunOk && (
        <div className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/5 px-3.5 py-2.5 text-xs font-medium text-success">
          <CheckCircle2 className="size-3.5" />
          Dry-run passed — the API server accepts this manifest.
        </div>
      )}
    </div>
  );
}
