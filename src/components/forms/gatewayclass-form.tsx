"use client";

import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { ResourcePicker } from "@/components/forms/pickers";
import { FormSection } from "@/components/forms/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { deleteAtPath, getAtPath, setAtPath, type Path } from "@/lib/object-path";

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function GatewayClassForm({ doc, onChange }: ResourceFormProps) {
  const paramsRef = getAtPath(doc, ["spec", "parametersRef"]);
  const hasParamsRef = paramsRef != null && typeof paramsRef === "object";
  const refNamespace = str(getAtPath(doc, ["spec", "parametersRef", "namespace"]));

  function setOrDelete(path: Path, value: unknown) {
    if (value === undefined || value === "") onChange(deleteAtPath(doc, path));
    else onChange(setAtPath(doc, path, value));
  }

  function toggleParamsRef(on: boolean) {
    if (on) {
      onChange(
        setAtPath(doc, ["spec", "parametersRef"], {
          group: "agentgateway.dev",
          kind: "AgentgatewayParameters",
          name: "",
        }),
      );
    } else {
      onChange(deleteAtPath(doc, ["spec", "parametersRef"]));
    }
  }

  function setParamsName(name: string) {
    // Keep group/kind pinned to AgentgatewayParameters whenever the name changes.
    let next = setAtPath(doc, ["spec", "parametersRef", "group"], "agentgateway.dev");
    next = setAtPath(next, ["spec", "parametersRef", "kind"], "AgentgatewayParameters");
    next = setAtPath(next, ["spec", "parametersRef", "name"], name);
    onChange(next);
  }

  return (
    <>
      <FormSection title="Controller" description="Which controller manages Gateways of this class.">
        <div className="space-y-1.5">
          <Label className="text-xs">controllerName</Label>
          <Input
            className="h-8 font-mono text-sm"
            value={str(getAtPath(doc, ["spec", "controllerName"])) ?? ""}
            placeholder="agentgateway.dev/agentgateway"
            onChange={(e) => onChange(setAtPath(doc, ["spec", "controllerName"], e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <Input
            className="h-8 text-sm"
            value={str(getAtPath(doc, ["spec", "description"])) ?? ""}
            placeholder="Human-readable description"
            onChange={(e) => setOrDelete(["spec", "description"], e.target.value)}
          />
        </div>
      </FormSection>

      <FormSection
        title="Parameters"
        description="Controller-specific configuration via AgentgatewayParameters."
      >
        <div className="flex items-center gap-2">
          <Switch
            id="gatewayclass-params-ref"
            checked={hasParamsRef}
            onCheckedChange={toggleParamsRef}
          />
          <Label htmlFor="gatewayclass-params-ref" className="text-xs">
            Reference parameters
          </Label>
        </div>

        {hasParamsRef && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <ResourcePicker
                resourceId="parameters"
                allowFreeText
                namespace={refNamespace}
                value={str(getAtPath(doc, ["spec", "parametersRef", "name"]))}
                onChange={setParamsName}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Namespace</Label>
              <Input
                className="h-8 font-mono text-sm"
                value={refNamespace ?? ""}
                placeholder="agentgateway-system"
                onChange={(e) =>
                  setOrDelete(["spec", "parametersRef", "namespace"], e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                Required: <span className="k8s-id">AgentgatewayParameters</span> is namespaced.
              </p>
            </div>
          </div>
        )}
        {hasParamsRef && (
          <p className="text-xs text-muted-foreground">
            kind <span className="k8s-id">AgentgatewayParameters</span>, group{" "}
            <span className="k8s-id">agentgateway.dev</span>
          </p>
        )}
      </FormSection>
    </>
  );
}
