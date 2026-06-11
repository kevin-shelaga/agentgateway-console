"use client";

import { Plus } from "lucide-react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { GatewayPicker } from "@/components/forms/pickers";
import { FormSection, numberOrUndefined, RemoveRowButton } from "@/components/forms/shared";
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

const PROTOCOLS = ["HTTP", "HTTPS", "TLS", "TCP"];

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function listenerRows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

export function ListenerSetForm({ doc, onChange }: ResourceFormProps) {
  const namespace = doc.metadata?.namespace;
  const parentRef = (getAtPath(doc, ["spec", "parentRef"]) ?? {}) as Record<string, unknown>;
  const listeners = listenerRows(getAtPath(doc, ["spec", "listeners"]));

  const setParentName = (name: string) =>
    onChange(
      setAtPath(doc, ["spec", "parentRef"], {
        group: "gateway.networking.k8s.io",
        kind: "Gateway",
        ...parentRef,
        name,
      }),
    );

  return (
    <>
      <FormSection
        title="Parent gateway"
        description="The Gateway these listeners attach to (spec.parentRef)."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Gateway</Label>
            <GatewayPicker
              namespace={str(parentRef.namespace) || namespace}
              value={str(parentRef.name) || undefined}
              onChange={setParentName}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Namespace (optional)</Label>
            <Input
              value={str(parentRef.namespace)}
              onChange={(e) =>
                onChange(
                  e.target.value === ""
                    ? deleteAtPath(doc, ["spec", "parentRef", "namespace"])
                    : setAtPath(doc, ["spec", "parentRef", "namespace"], e.target.value),
                )
              }
              placeholder={namespace ?? "same namespace"}
              className="h-9 font-mono text-xs"
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Listeners"
        description="Listeners added to the parent gateway."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange(
                setAtPath(doc, ["spec", "listeners", listeners.length], {
                  name: "",
                  protocol: "HTTP",
                  port: 8080,
                }),
              )
            }
          >
            <Plus className="size-3.5" /> Add listener
          </Button>
        }
      >
        {listeners.length === 0 ? (
          <p className="text-xs text-muted-foreground">At least one listener is required.</p>
        ) : (
          <div className="space-y-3">
            {listeners.map((listener, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                <div className="min-w-32 flex-1 space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={str(listener.name)}
                    onChange={(e) =>
                      onChange(setAtPath(doc, ["spec", "listeners", i, "name"], e.target.value))
                    }
                    placeholder="extra-http"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="w-28 space-y-1.5">
                  <Label className="text-xs">Protocol</Label>
                  <Select
                    value={str(listener.protocol) || "HTTP"}
                    onValueChange={(v) =>
                      onChange(setAtPath(doc, ["spec", "listeners", i, "protocol"], v))
                    }
                  >
                    <SelectTrigger className="h-8 w-full font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((p) => (
                        <SelectItem key={p} value={p} className="font-mono text-xs">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24 space-y-1.5">
                  <Label className="text-xs">Port</Label>
                  <Input
                    type="number"
                    value={typeof listener.port === "number" ? listener.port : ""}
                    onChange={(e) =>
                      onChange(
                        setAtPath(
                          doc,
                          ["spec", "listeners", i, "port"],
                          numberOrUndefined(e.target.value) ?? 0,
                        ),
                      )
                    }
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="min-w-36 flex-1 space-y-1.5">
                  <Label className="text-xs">Hostname (optional)</Label>
                  <Input
                    value={str(listener.hostname)}
                    onChange={(e) =>
                      onChange(
                        e.target.value === ""
                          ? deleteAtPath(doc, ["spec", "listeners", i, "hostname"])
                          : setAtPath(doc, ["spec", "listeners", i, "hostname"], e.target.value),
                      )
                    }
                    placeholder="*.example.com"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                {listener.tls !== undefined && (
                  <p className="w-full text-[11px] text-muted-foreground">
                    TLS for this listener is configured in YAML.
                  </p>
                )}
                <RemoveRowButton
                  onClick={() => onChange(deleteAtPath(doc, ["spec", "listeners", i]))}
                  label={`Remove listener ${i + 1}`}
                />
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </>
  );
}
