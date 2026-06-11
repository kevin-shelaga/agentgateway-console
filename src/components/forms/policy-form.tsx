"use client";

import { Plus } from "lucide-react";
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
import {
  FormSection,
  RemoveRowButton,
  StringListEditor,
  numberOrUndefined,
} from "@/components/forms/shared";
import { ResourcePicker } from "@/components/forms/pickers";
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

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Delete the leaf at `path`, then remove now-empty ancestor objects, but never
 * ancestors shallower than `minDepth` path segments (so section roots like
 * `spec.traffic` survive even when emptied).
 */
function pruneDelete(doc: K8sResource, path: Path, minDepth: number): K8sResource {
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

/** Set a string value, or prune-delete the key when the value is empty. */
function setOrPrune(
  doc: K8sResource,
  path: Path,
  value: string | number | undefined,
  minDepth: number,
): K8sResource {
  if (value === undefined || value === "") return pruneDelete(doc, path, minDepth);
  return setAtPath(doc, path, value);
}

/** Muted chip list for sub-keys that are only editable in YAML. */
function YamlChips({ prefix, keys }: { prefix: string; keys: string[] }) {
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{prefix}</span>
      {keys.map((k) => (
        <Badge key={k} variant="outline" className="k8s-id text-[11px] font-normal">
          {k}
        </Badge>
      ))}
    </div>
  );
}

// CEL validation on the CRD requires group "" for Service, agentgateway.dev
// for AgentgatewayBackend, and gateway.networking.k8s.io for
// Gateway/HTTPRoute/GRPCRoute/ListenerSet.
const TARGET_KINDS: ReadonlyArray<{
  kind: string;
  group: string;
  /** Registry id for ResourcePicker; undefined → free-text input. */
  resourceId?: string;
}> = [
  { kind: "Gateway", group: "gateway.networking.k8s.io", resourceId: "gateways" },
  { kind: "HTTPRoute", group: "gateway.networking.k8s.io", resourceId: "httproutes" },
  { kind: "GRPCRoute", group: "gateway.networking.k8s.io", resourceId: "grpcroutes" },
  { kind: "ListenerSet", group: "gateway.networking.k8s.io" },
  { kind: "Service", group: "", resourceId: "services" },
  { kind: "AgentgatewayBackend", group: "agentgateway.dev", resourceId: "backends" },
  {
    kind: "EnterpriseAgentgatewayBackend",
    group: "enterpriseagentgateway.solo.io",
    resourceId: "ent-backends",
  },
];

function TargetRefsEditor({ doc, onChange }: ResourceFormProps) {
  const refs = asArr(getAtPath(doc, ["spec", "targetRefs"]));
  const namespace = doc.metadata?.namespace;

  function addRow() {
    onChange(
      setAtPath(doc, ["spec", "targetRefs", refs.length], {
        group: "gateway.networking.k8s.io",
        kind: "Gateway",
        name: "",
      }),
    );
  }

  function removeRow(i: number) {
    if (refs.length <= 1) {
      onChange(deleteAtPath(doc, ["spec", "targetRefs"]));
    } else {
      onChange(deleteAtPath(doc, ["spec", "targetRefs", i]));
    }
  }

  return (
    <div className="space-y-2">
      {refs.map((raw, i) => {
        const ref = asObj(raw) ?? {};
        const kind = asStr(ref.kind);
        const meta = TARGET_KINDS.find((k) => k.kind === kind);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <Select
              value={meta ? kind : undefined}
              onValueChange={(v) => {
                const next = TARGET_KINDS.find((k) => k.kind === v);
                if (!next) return;
                onChange(
                  setAtPath(doc, ["spec", "targetRefs", i], {
                    group: next.group,
                    kind: next.kind,
                    name: "",
                  }),
                );
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs" aria-label="Target kind">
                <SelectValue placeholder={kind || "Kind"} />
              </SelectTrigger>
              <SelectContent>
                {TARGET_KINDS.map((k) => (
                  <SelectItem key={k.kind} value={k.kind} className="text-xs">
                    {k.kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="min-w-48 flex-1">
              {meta?.resourceId ? (
                <ResourcePicker
                  resourceId={meta.resourceId}
                  namespace={namespace}
                  value={asStr(ref.name) || undefined}
                  onChange={(v) => onChange(setAtPath(doc, ["spec", "targetRefs", i, "name"], v))}
                  allowFreeText
                />
              ) : (
                <Input
                  value={asStr(ref.name)}
                  onChange={(e) =>
                    onChange(setAtPath(doc, ["spec", "targetRefs", i, "name"], e.target.value))
                  }
                  placeholder="name"
                  className="h-8 font-mono text-xs"
                />
              )}
            </div>
            <Input
              value={asStr(ref.sectionName)}
              onChange={(e) => {
                const v = e.target.value;
                onChange(
                  v === ""
                    ? deleteAtPath(doc, ["spec", "targetRefs", i, "sectionName"])
                    : setAtPath(doc, ["spec", "targetRefs", i, "sectionName"], v),
                );
              }}
              placeholder="sectionName (optional)"
              className="h-8 w-44 font-mono text-xs"
            />
            <RemoveRowButton onClick={() => removeRow(i)} label={`Remove target ${i + 1}`} />
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="h-7" onClick={addRow}>
        <Plus className="size-3.5" />
        Add target
      </Button>
    </div>
  );
}

const LOCAL_RATE_LIMIT_UNITS = ["Seconds", "Minutes", "Hours"] as const;

function LocalRateLimitRows({ doc, onChange }: ResourceFormProps) {
  const base: Path = ["spec", "traffic", "rateLimit", "local"];
  const local = asArr(getAtPath(doc, base));

  function removeRow(i: number) {
    if (local.length <= 1) {
      onChange(pruneDelete(doc, base, 3));
    } else {
      onChange(deleteAtPath(doc, [...base, i]));
    }
  }

  return (
    <div className="space-y-2">
      {local.map((raw, i) => {
        const row = asObj(raw) ?? {};
        const isTokens = row.tokens !== undefined && row.requests === undefined;
        const field = isTokens ? "tokens" : "requests";
        const amount = row[field];
        const burst = row.burst;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Select
              value={field}
              onValueChange={(v) => {
                const amt =
                  typeof row.requests === "number"
                    ? row.requests
                    : typeof row.tokens === "number"
                      ? row.tokens
                      : 1;
                const next: Obj = { ...row };
                delete next.requests;
                delete next.tokens;
                next[v] = amt;
                if (next.unit === undefined) next.unit = "Seconds";
                onChange(setAtPath(doc, [...base, i], next));
              }}
            >
              <SelectTrigger className="h-8 w-28 text-xs" aria-label="Rate limit type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="requests" className="text-xs">
                  Requests
                </SelectItem>
                <SelectItem value="tokens" className="text-xs">
                  Tokens
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              value={typeof amount === "number" ? String(amount) : ""}
              onChange={(e) => {
                const n = numberOrUndefined(e.target.value);
                onChange(
                  n === undefined
                    ? deleteAtPath(doc, [...base, i, field])
                    : setAtPath(doc, [...base, i, field], n),
                );
              }}
              placeholder="100"
              className="h-8 w-24 text-xs"
              aria-label="Allowed per unit"
            />
            <span className="text-xs text-muted-foreground">per</span>
            <Select
              value={typeof row.unit === "string" ? row.unit : undefined}
              onValueChange={(v) => onChange(setAtPath(doc, [...base, i, "unit"], v))}
            >
              <SelectTrigger className="h-8 w-28 text-xs" aria-label="Rate limit unit">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {LOCAL_RATE_LIMIT_UNITS.map((u) => (
                  <SelectItem key={u} value={u} className="text-xs">
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              value={typeof burst === "number" ? String(burst) : ""}
              onChange={(e) => {
                const n = numberOrUndefined(e.target.value);
                onChange(
                  n === undefined
                    ? deleteAtPath(doc, [...base, i, "burst"])
                    : setAtPath(doc, [...base, i, "burst"], n),
                );
              }}
              placeholder="burst"
              className="h-8 w-24 text-xs"
              aria-label="Burst allowance"
            />
            <RemoveRowButton onClick={() => removeRow(i)} label={`Remove rate limit ${i + 1}`} />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() =>
          onChange(setAtPath(doc, [...base, local.length], { requests: 100, unit: "Seconds" }))
        }
      >
        <Plus className="size-3.5" />
        Add local limit
      </Button>
    </div>
  );
}

/** Traffic sub-keys with guided editors; everything else is YAML-only chips. */
const TRAFFIC_HANDLED = new Set(["timeouts", "retry", "cors", "rateLimit"]);

function TrafficEditor({ doc, onChange }: ResourceFormProps) {
  const traffic = asObj(getAtPath(doc, ["spec", "traffic"])) ?? {};
  const cors = asObj(traffic.cors);
  const retry = asObj(traffic.retry);
  const rateLimit = asObj(traffic.rateLimit);
  const yamlOnlyKeys = Object.keys(traffic).filter((k) => !TRAFFIC_HANDLED.has(k));
  const rateLimitExtra = Object.keys(rateLimit ?? {})
    .filter((k) => k !== "local")
    .map((k) => `rateLimit.${k}`);

  const setStr = (path: Path, minDepth: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(setOrPrune(doc, path, e.target.value, minDepth));

  const setList = (key: string) => (values: string[]) =>
    onChange(
      values.length === 0
        ? pruneDelete(doc, ["spec", "traffic", "cors", key], 3)
        : setAtPath(doc, ["spec", "traffic", "cors", key], values),
    );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Request timeout</Label>
          <Input
            value={asStr(getAtPath(doc, ["spec", "traffic", "timeouts", "request"]))}
            onChange={setStr(["spec", "traffic", "timeouts", "request"], 3)}
            placeholder="30s"
            className="h-8 font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Deadline for a request to a backend, e.g. <span className="k8s-id">30s</span>.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Retry</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={0}
            value={typeof retry?.attempts === "number" ? String(retry.attempts) : ""}
            onChange={(e) => {
              const n = numberOrUndefined(e.target.value);
              onChange(
                n === undefined
                  ? pruneDelete(doc, ["spec", "traffic", "retry", "attempts"], 3)
                  : setAtPath(doc, ["spec", "traffic", "retry", "attempts"], n),
              );
            }}
            placeholder="attempts"
            className="h-8 w-28 text-xs"
            aria-label="Retry attempts"
          />
          <Input
            value={asStr(retry?.backoff)}
            onChange={setStr(["spec", "traffic", "retry", "backoff"], 3)}
            placeholder="backoff, e.g. 1s"
            className="h-8 w-40 font-mono text-xs"
            aria-label="Retry backoff"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs">CORS</Label>
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Allowed origins</p>
          <StringListEditor
            values={strList(cors?.allowOrigins)}
            onChange={setList("allowOrigins")}
            placeholder="https://example.com"
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Allowed methods</p>
          <StringListEditor
            values={strList(cors?.allowMethods)}
            onChange={setList("allowMethods")}
            placeholder="GET"
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Allowed headers</p>
          <StringListEditor
            values={strList(cors?.allowHeaders)}
            onChange={setList("allowHeaders")}
            placeholder="content-type"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="cors-allow-credentials"
            checked={cors?.allowCredentials === true}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? setAtPath(doc, ["spec", "traffic", "cors", "allowCredentials"], true)
                  : pruneDelete(doc, ["spec", "traffic", "cors", "allowCredentials"], 3),
              )
            }
          />
          <Label htmlFor="cors-allow-credentials" className="text-xs font-normal">
            Allow credentials
          </Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Local rate limits</Label>
        <LocalRateLimitRows doc={doc} onChange={onChange} />
        <YamlChips prefix="configured in YAML:" keys={rateLimitExtra} />
      </div>

      <YamlChips prefix="configured in YAML:" keys={yamlOnlyKeys} />
    </div>
  );
}

function PolicySectionCard({
  doc,
  onChange,
  sectionKey,
  title,
  description,
  children,
}: ResourceFormProps & {
  sectionKey: "traffic" | "frontend" | "backend";
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const present = asObj(getAtPath(doc, ["spec", sectionKey])) !== undefined;
  return (
    <FormSection
      title={title}
      description={description}
      actions={
        <Switch
          checked={present}
          onCheckedChange={(checked) =>
            onChange(
              checked
                ? setAtPath(doc, ["spec", sectionKey], {})
                : deleteAtPath(doc, ["spec", sectionKey]),
            )
          }
          aria-label={`Enable ${sectionKey} policy`}
        />
      }
    >
      {present ? (
        children ?? null
      ) : (
        <p className="text-xs text-muted-foreground">
          Off — toggle to add <span className="k8s-id">spec.{sectionKey}</span>.
        </p>
      )}
    </FormSection>
  );
}

/** Top-level spec keys this form understands; everything else is chip-listed. */
const SPEC_HANDLED = new Set(["targetRefs", "targetSelectors", "traffic", "frontend", "backend"]);

export function PolicyForm({ doc, onChange }: ResourceFormProps) {
  const spec = asObj(doc?.spec) ?? {};
  const hasSelectors = spec.targetSelectors !== undefined;
  const frontendKeys = Object.keys(asObj(spec.frontend) ?? {});
  const backendKeys = Object.keys(asObj(spec.backend) ?? {});
  const otherSpecKeys = Object.keys(spec).filter((k) => !SPEC_HANDLED.has(k));

  return (
    <>
      <FormSection
        title="Targets"
        description="Resources this policy attaches to. All targets in one policy must be the same kind."
      >
        <TargetRefsEditor doc={doc} onChange={onChange} />
        {hasSelectors && (
          <p className="text-xs text-muted-foreground">
            <span className="k8s-id">targetSelectors</span> — label selectors configured in YAML.
          </p>
        )}
      </FormSection>

      <PolicySectionCard
        doc={doc}
        onChange={onChange}
        sectionKey="traffic"
        title="Traffic policy"
        description="Request processing: timeouts, retries, CORS, rate limits, and more."
      >
        <TrafficEditor doc={doc} onChange={onChange} />
      </PolicySectionCard>

      <PolicySectionCard
        doc={doc}
        onChange={onChange}
        sectionKey="frontend"
        title="Frontend policy"
        description="Incoming connection handling (TLS, access logs, proxy protocol, tracing). Targets a Gateway only."
      >
        {frontendKeys.length > 0 ? (
          <YamlChips prefix="configured in YAML:" keys={frontendKeys} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Frontend settings are deep — configure sub-keys (tls, accessLog, proxyProtocol, …) in
            the YAML editor.
          </p>
        )}
      </PolicySectionCard>

      <PolicySectionCard
        doc={doc}
        onChange={onChange}
        sectionKey="backend"
        title="Backend policy"
        description="Connections to destination backends (tls, auth, http, tcp sub-policies)."
      >
        {backendKeys.length > 0 ? (
          <YamlChips prefix="configured in YAML:" keys={backendKeys} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Backend settings are deep — configure sub-keys (tls, auth, http, tcp, …) in the YAML
            editor.
          </p>
        )}
      </PolicySectionCard>

      {otherSpecKeys.length > 0 && (
        <YamlChips prefix="other spec keys configured in YAML:" keys={otherSpecKeys} />
      )}
    </>
  );
}
