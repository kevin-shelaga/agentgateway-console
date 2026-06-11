"use client";

import { Plus } from "lucide-react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { rows, str } from "@/components/forms/httproute-form";
import { FormSection, RemoveRowButton } from "@/components/forms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteAtPath, getAtPath, setAtPath } from "@/lib/object-path";

const GATEWAY_API_GROUP = "gateway.networking.k8s.io";

/** kind → its API group, for the from/to selectors. */
const FROM_KINDS: Record<string, string> = {
  HTTPRoute: GATEWAY_API_GROUP,
  GRPCRoute: GATEWAY_API_GROUP,
  TLSRoute: GATEWAY_API_GROUP,
  Gateway: GATEWAY_API_GROUP,
};
const TO_KINDS: Record<string, string> = {
  Service: "",
  Secret: "",
  AgentgatewayBackend: "agentgateway.dev",
};

function RefRows({
  doc,
  onChange,
  field,
  kinds,
  withNamespace,
  withName,
}: ResourceFormProps & {
  field: "from" | "to";
  kinds: Record<string, string>;
  withNamespace?: boolean;
  withName?: boolean;
}) {
  const entries = rows(getAtPath(doc, ["spec", field]));
  const kindNames = Object.keys(kinds);

  return entries.length === 0 ? (
    <p className="text-xs text-muted-foreground">At least one entry is required.</p>
  ) : (
    <div className="space-y-3">
      {entries.map((entry, i) => {
        const kind = str(entry.kind) ?? kindNames[0];
        return (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
            <div className="w-48 space-y-1.5">
              <Label className="text-xs">Kind</Label>
              <Select
                value={kindNames.includes(kind) ? kind : kindNames[0]}
                onValueChange={(v) =>
                  onChange(
                    setAtPath(doc, ["spec", field, i], {
                      ...entry,
                      kind: v,
                      group: kinds[v],
                    }),
                  )
                }
              >
                <SelectTrigger className="h-8 w-full font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kindNames.map((k) => (
                    <SelectItem key={k} value={k} className="font-mono text-xs">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {withNamespace && (
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label className="text-xs">From namespace</Label>
                <Input
                  value={str(entry.namespace) ?? ""}
                  onChange={(e) =>
                    onChange(setAtPath(doc, ["spec", field, i, "namespace"], e.target.value))
                  }
                  placeholder="default"
                  className="h-8 font-mono text-xs"
                />
              </div>
            )}
            {withName && (
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label className="text-xs">Name (optional — all when empty)</Label>
                <Input
                  value={str(entry.name) ?? ""}
                  onChange={(e) =>
                    onChange(
                      e.target.value === ""
                        ? deleteAtPath(doc, ["spec", field, i, "name"])
                        : setAtPath(doc, ["spec", field, i, "name"], e.target.value),
                    )
                  }
                  placeholder="any"
                  className="h-8 font-mono text-xs"
                />
              </div>
            )}
            <RemoveRowButton
              onClick={() => onChange(deleteAtPath(doc, ["spec", field, i]))}
              label={`Remove ${field} ${i + 1}`}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Grants other namespaces permission to reference resources in this one. */
export function ReferenceGrantForm({ doc, onChange }: ResourceFormProps) {
  const addRow = (field: "from" | "to", row: Record<string, unknown>) => {
    const entries = rows(getAtPath(doc, ["spec", field]));
    onChange(setAtPath(doc, ["spec", field, entries.length], row));
  };

  return (
    <>
      <FormSection
        title="From"
        description="Which kinds, in which namespaces, may reference into this namespace."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              addRow("from", { group: GATEWAY_API_GROUP, kind: "HTTPRoute", namespace: "" })
            }
          >
            <Plus className="size-3.5" /> Add source
          </Button>
        }
      >
        <RefRows doc={doc} onChange={onChange} field="from" kinds={FROM_KINDS} withNamespace />
      </FormSection>

      <FormSection
        title="To"
        description="Which local kinds those sources may reference (optionally a single name)."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addRow("to", { group: "", kind: "Service" })}
          >
            <Plus className="size-3.5" /> Add target
          </Button>
        }
      >
        <RefRows doc={doc} onChange={onChange} field="to" kinds={TO_KINDS} withName />
      </FormSection>
    </>
  );
}
