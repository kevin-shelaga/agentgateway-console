"use client";

import { Plus } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { FormSection, RemoveRowButton } from "@/components/forms/shared";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import type { K8sResource } from "@/lib/types";
import { deleteAtPath, getAtPath, setAtPath, type Path } from "@/lib/object-path";

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Delete the leaf at `path`, then remove now-empty ancestor objects, but never
 * ancestors shallower than `minDepth` path segments (depth 2 keeps `spec`).
 */
function pruneDelete(doc: K8sResource, path: Path, minDepth = 2): K8sResource {
  let next = deleteAtPath(doc, path);
  let parent = path.slice(0, -1);
  while (parent.length >= minDepth) {
    const v = asObj(getAtPath(next, parent));
    if (!v || Object.keys(v).length > 0) break;
    next = deleteAtPath(next, parent);
    parent = parent.slice(0, -1);
  }
  return next;
}

/** Sentinel value for "unset this key" select items (radix forbids ""). */
const UNSET = "__unset__";

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"];
const LOG_FORMATS = ["text", "json"];
const PULL_POLICIES = ["Always", "IfNotPresent", "Never"];

function EnumSelect({
  value,
  options,
  placeholder,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string | undefined) => void;
  ariaLabel: string;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => onChange(v === UNSET ? undefined : v)}
    >
      <SelectTrigger className="h-8 w-full font-mono text-xs" aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET} className="text-xs text-muted-foreground">
          (default)
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="font-mono text-xs">
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EnvEditor({ doc, onChange }: ResourceFormProps) {
  const env = asArr(getAtPath(doc, ["spec", "env"]));

  function removeRow(i: number) {
    if (env.length <= 1) {
      onChange(deleteAtPath(doc, ["spec", "env"]));
    } else {
      onChange(deleteAtPath(doc, ["spec", "env", i]));
    }
  }

  return (
    <div className="space-y-2">
      {env.map((raw, i) => {
        const row = asObj(raw) ?? {};
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex items-center gap-2">
            <Input
              value={asStr(row.name)}
              onChange={(e) => onChange(setAtPath(doc, ["spec", "env", i, "name"], e.target.value))}
              placeholder="NAME"
              className="h-8 w-48 font-mono text-xs"
              aria-label={`Env var ${i + 1} name`}
            />
            {row.valueFrom !== undefined ? (
              <span className="flex-1 text-xs text-muted-foreground">
                <span className="k8s-id">valueFrom</span> configured in YAML
              </span>
            ) : (
              <Input
                value={asStr(row.value)}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange(
                    v === ""
                      ? deleteAtPath(doc, ["spec", "env", i, "value"])
                      : setAtPath(doc, ["spec", "env", i, "value"], v),
                  );
                }}
                placeholder="value"
                className="h-8 flex-1 font-mono text-xs"
                aria-label={`Env var ${i + 1} value`}
              />
            )}
            <RemoveRowButton onClick={() => removeRow(i)} label={`Remove env var ${i + 1}`} />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() => onChange(setAtPath(doc, ["spec", "env", env.length], { name: "", value: "" }))}
      >
        <Plus className="size-3.5" />
        Add variable
      </Button>
    </div>
  );
}

/** Deep / opaque spec keys that stay YAML-only. */
const YAML_ONLY_KEYS = [
  "rawConfig",
  "shutdown",
  "deployment",
  "service",
  "serviceAccount",
  "podDisruptionBudget",
  "horizontalPodAutoscaler",
];

export function ParametersForm({ doc, onChange }: ResourceFormProps) {
  const levelListId = useId();
  const spec = asObj(doc?.spec) ?? {};
  const istio = asObj(spec.istio);
  const istioEnabled = istio?.enabled === true;
  const yamlOnlyConfigured = YAML_ONLY_KEYS.filter((k) => spec[k] !== undefined);

  const strField =
    (path: Path, minDepth = 2) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      onChange(v === "" ? pruneDelete(doc, path, minDepth) : setAtPath(doc, path, v));
    };

  const textInput = (path: Path, placeholder: string, minDepth = 2) => (
    <Input
      value={asStr(getAtPath(doc, path))}
      onChange={strField(path, minDepth)}
      placeholder={placeholder}
      className="h-8 font-mono text-xs"
    />
  );

  return (
    <>
      <FormSection title="Logging" description="Dataplane log level and output format.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Level</Label>
            <Input
              list={levelListId}
              value={asStr(getAtPath(doc, ["spec", "logging", "level"]))}
              onChange={strField(["spec", "logging", "level"])}
              placeholder="info"
              className="h-8 font-mono text-xs"
            />
            <datalist id={levelListId}>
              {LOG_LEVELS.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <p className="text-[11px] text-muted-foreground">
              RUST_LOG syntax — a level like <span className="k8s-id">info</span> or per-module,
              e.g. <span className="k8s-id">info,rmcp=warn</span>.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Format</Label>
            <EnumSelect
              value={asStr(getAtPath(doc, ["spec", "logging", "format"]))}
              options={LOG_FORMATS}
              placeholder="text (default)"
              ariaLabel="Log format"
              onChange={(v) =>
                onChange(
                  v === undefined
                    ? pruneDelete(doc, ["spec", "logging", "format"])
                    : setAtPath(doc, ["spec", "logging", "format"], v),
                )
              }
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Image"
        description="Container image overrides. Defaults: cr.agentgateway.dev/agentgateway:<version>."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Registry</Label>
            {textInput(["spec", "image", "registry"], "cr.agentgateway.dev")}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Repository</Label>
            {textInput(["spec", "image", "repository"], "agentgateway")}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tag</Label>
            {textInput(["spec", "image", "tag"], "latest")}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pull policy</Label>
            <EnumSelect
              value={asStr(getAtPath(doc, ["spec", "image", "pullPolicy"]))}
              options={PULL_POLICIES}
              placeholder="(Kubernetes default)"
              ariaLabel="Image pull policy"
              onChange={(v) =>
                onChange(
                  v === undefined
                    ? pruneDelete(doc, ["spec", "image", "pullPolicy"])
                    : setAtPath(doc, ["spec", "image", "pullPolicy"], v),
                )
              }
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Resources"
        description="Compute requests and limits for the agentgateway container."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Requests · CPU</Label>
            {textInput(["spec", "resources", "requests", "cpu"], "100m", 2)}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Requests · Memory</Label>
            {textInput(["spec", "resources", "requests", "memory"], "128Mi", 2)}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Limits · CPU</Label>
            {textInput(["spec", "resources", "limits", "cpu"], "1", 2)}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Limits · Memory</Label>
            {textInput(["spec", "resources", "limits", "memory"], "512Mi", 2)}
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Environment variables"
        description="Container env overrides. SESSION_KEY takes precedence over the managed session key Secret."
      >
        <EnvEditor doc={doc} onChange={onChange} />
      </FormSection>

      <FormSection
        title="Istio integration"
        description="Natively connect to Istio-enabled pods with mTLS."
        actions={
          <Switch
            checked={istioEnabled}
            onCheckedChange={(checked) =>
              onChange(setAtPath(doc, ["spec", "istio", "enabled"], checked))
            }
            aria-label="Enable Istio integration"
          />
        }
      >
        {istioEnabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Trust domain</Label>
              {textInput(["spec", "istio", "trustDomain"], "cluster.local", 3)}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CA address</Label>
              {textInput(["spec", "istio", "caAddress"], "https://istiod.istio-system.svc:15012", 3)}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cluster ID</Label>
              {textInput(["spec", "istio", "clusterId"], "Kubernetes", 3)}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Network</Label>
              {textInput(["spec", "istio", "network"], "", 3)}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Off — toggle to set <span className="k8s-id">spec.istio.enabled</span>.
          </p>
        )}
      </FormSection>

      {yamlOnlyConfigured.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-xs text-muted-foreground">configured in YAML:</span>
          {yamlOnlyConfigured.map((k) => (
            <Badge key={k} variant="outline" className="k8s-id text-[11px] font-normal">
              {k}
            </Badge>
          ))}
        </div>
      )}
    </>
  );
}
