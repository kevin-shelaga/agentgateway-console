"use client";

import { Plus } from "lucide-react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { rows, str } from "@/components/forms/httproute-form";
import { ResourcePicker, ServicePicker } from "@/components/forms/pickers";
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

const TARGET_KINDS = ["Service", "AgentgatewayBackend"] as const;

export function BackendTlsPolicyForm({ doc, onChange }: ResourceFormProps) {
  const namespace = doc.metadata?.namespace;
  const targetRefs = rows(getAtPath(doc, ["spec", "targetRefs"]));
  const validation = (getAtPath(doc, ["spec", "validation"]) ?? {}) as Record<string, unknown>;
  const caMode =
    typeof validation.wellKnownCACertificates === "string"
      ? "system"
      : Array.isArray(validation.caCertificateRefs)
        ? "refs"
        : "system";

  return (
    <>
      <FormSection
        title="Targets"
        description="Backends whose connections the gateway verifies with TLS."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange(
                setAtPath(doc, ["spec", "targetRefs", targetRefs.length], {
                  group: "",
                  kind: "Service",
                  name: "",
                }),
              )
            }
          >
            <Plus className="size-3.5" /> Add target
          </Button>
        }
      >
        {targetRefs.length === 0 ? (
          <p className="text-xs text-muted-foreground">At least one target is required.</p>
        ) : (
          <div className="space-y-3">
            {targetRefs.map((ref, i) => {
              const kind = str(ref.kind) ?? "Service";
              return (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                  <div className="w-44 space-y-1.5">
                    <Label className="text-xs">Kind</Label>
                    <Select
                      value={kind}
                      onValueChange={(v) =>
                        onChange(
                          setAtPath(doc, ["spec", "targetRefs", i], {
                            group: v === "Service" ? "" : "agentgateway.dev",
                            kind: v,
                            name: str(ref.name) ?? "",
                          }),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-full font-mono text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGET_KINDS.map((k) => (
                          <SelectItem key={k} value={k} className="font-mono text-xs">
                            {k}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-48 flex-1 space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    {kind === "Service" ? (
                      <ServicePicker
                        namespace={namespace}
                        value={str(ref.name) || undefined}
                        onChange={(name) =>
                          onChange(setAtPath(doc, ["spec", "targetRefs", i, "name"], name))
                        }
                      />
                    ) : (
                      <ResourcePicker
                        resourceId="backends"
                        namespace={namespace}
                        allowFreeText
                        value={str(ref.name) || undefined}
                        onChange={(name) =>
                          onChange(setAtPath(doc, ["spec", "targetRefs", i, "name"], name))
                        }
                      />
                    )}
                  </div>
                  <RemoveRowButton
                    onClick={() => onChange(deleteAtPath(doc, ["spec", "targetRefs", i]))}
                    label={`Remove target ${i + 1}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </FormSection>

      <FormSection
        title="TLS validation"
        description="How the gateway verifies the backend's certificate (spec.validation)."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Hostname (SAN to verify)</Label>
            <Input
              value={str(validation.hostname) ?? ""}
              onChange={(e) =>
                onChange(setAtPath(doc, ["spec", "validation", "hostname"], e.target.value))
              }
              placeholder="my-service.example.com"
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Certificate authority</Label>
            <Select
              value={caMode}
              onValueChange={(v) =>
                onChange(
                  v === "system"
                    ? setAtPath(
                        deleteAtPath(doc, ["spec", "validation", "caCertificateRefs"]),
                        ["spec", "validation", "wellKnownCACertificates"],
                        "System",
                      )
                    : setAtPath(
                        deleteAtPath(doc, ["spec", "validation", "wellKnownCACertificates"]),
                        ["spec", "validation", "caCertificateRefs"],
                        [],
                      ),
                )
              }
            >
              <SelectTrigger className="h-9 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system" className="text-xs">
                  System CAs (wellKnownCACertificates)
                </SelectItem>
                <SelectItem value="refs" className="text-xs">
                  Custom CA refs (edit in YAML)
                </SelectItem>
              </SelectContent>
            </Select>
            {caMode === "refs" && (
              <p className="text-[11px] text-muted-foreground">
                Add ConfigMap references under{" "}
                <span className="k8s-id">spec.validation.caCertificateRefs</span> in the YAML.
              </p>
            )}
          </div>
        </div>
      </FormSection>
    </>
  );
}
