"use client";

import { Plus } from "lucide-react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { ResourcePicker, ServicePicker } from "@/components/forms/pickers";
import {
  FormSection,
  numberOrUndefined,
  RemoveRowButton,
  StringListEditor,
} from "@/components/forms/shared";
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
import { deleteAtPath, getAtPath, setAtPath, type Path } from "@/lib/object-path";
import type { K8sResource } from "@/lib/types";

const PATH_TYPES = ["PathPrefix", "Exact", "RegularExpression"];
const METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"];
/** Radix Select items can't have an empty value; sentinel for "no method match". */
const ANY_METHOD = "__any__";

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export function rows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}))
    : [];
}

export function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** spec.parentRefs[] editor shared by HTTPRoute and GRPCRoute. */
export function ParentRefsSection({ doc, onChange }: ResourceFormProps) {
  const refs = rows(getAtPath(doc, ["spec", "parentRefs"]));

  function setOrDelete(path: Path, value: unknown) {
    if (value === undefined || value === "") onChange(deleteAtPath(doc, path));
    else onChange(setAtPath(doc, path, value));
  }

  return (
    <FormSection
      title="Parent refs"
      description="Gateways this route attaches to."
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => onChange(setAtPath(doc, ["spec", "parentRefs"], [...refs, { name: "" }]))}
        >
          <Plus className="size-3.5" />
          Add parent
        </Button>
      }
    >
      {refs.length === 0 && <p className="text-xs text-muted-foreground">No parent refs yet.</p>}
      {refs.map((ref, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Gateway</Label>
              <ResourcePicker
                resourceId="gateways"
                allowFreeText
                namespace={str(ref.namespace) ?? str(doc?.metadata?.namespace)}
                value={str(ref.name)}
                onChange={(v) => onChange(setAtPath(doc, ["spec", "parentRefs", i, "name"], v))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Namespace (optional)</Label>
              <Input
                className="h-8 font-mono text-sm"
                value={str(ref.namespace) ?? ""}
                placeholder={str(doc?.metadata?.namespace) ?? "same namespace"}
                onChange={(e) => setOrDelete(["spec", "parentRefs", i, "namespace"], e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Section name (optional)</Label>
              <Input
                className="h-8 font-mono text-sm"
                value={str(ref.sectionName) ?? ""}
                placeholder="listener name"
                onChange={(e) =>
                  setOrDelete(["spec", "parentRefs", i, "sectionName"], e.target.value)
                }
              />
            </div>
          </div>
          <RemoveRowButton
            onClick={() => onChange(deleteAtPath(doc, ["spec", "parentRefs", i]))}
            label={`Remove parent ref ${str(ref.name) ?? i}`}
          />
        </div>
      ))}
    </FormSection>
  );
}

/** backendRefs[] editor for one rule; shared by HTTPRoute and GRPCRoute. */
/** backendRef kinds routes may point at, with their groups and pickers. */
const BACKEND_REF_KINDS: Record<string, { group: string; resourceId: string }> = {
  Service: { group: "", resourceId: "services" },
  AgentgatewayBackend: { group: "agentgateway.dev", resourceId: "backends" },
  EnterpriseAgentgatewayBackend: {
    group: "enterpriseagentgateway.solo.io",
    resourceId: "ent-backends",
  },
};

export function BackendRefsEditor({
  doc,
  onChange,
  rulePath,
}: {
  doc: K8sResource;
  onChange: (doc: K8sResource) => void;
  rulePath: Path;
}) {
  const basePath: Path = [...rulePath, "backendRefs"];
  const refs = rows(getAtPath(doc, basePath));
  const namespace = str(doc?.metadata?.namespace);

  function setOrDelete(path: Path, value: unknown) {
    if (value === undefined || value === "") onChange(deleteAtPath(doc, path));
    else onChange(setAtPath(doc, path, value));
  }

  function setKind(i: number, kind: string) {
    const refPath: Path = [...basePath, i];
    const meta = BACKEND_REF_KINDS[kind] ?? BACKEND_REF_KINDS.Service;
    let next = doc;
    if (meta.group) {
      next = setAtPath(next, [...refPath, "group"], meta.group);
      next = setAtPath(next, [...refPath, "kind"], kind);
      // Backend CRD refs don't take a Service port by default.
      next = deleteAtPath(next, [...refPath, "port"]);
    } else {
      next = deleteAtPath(next, [...refPath, "group"]);
      next = setAtPath(next, [...refPath, "kind"], "Service");
    }
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Backends</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => onChange(setAtPath(doc, basePath, [...refs, { name: "" }]))}
        >
          <Plus className="size-3.5" />
          Add backend
        </Button>
      </div>
      {refs.length === 0 && <p className="text-xs text-muted-foreground">No backends yet.</p>}
      {refs.map((ref, i) => {
        const kind = str(ref.kind) && BACKEND_REF_KINDS[str(ref.kind)!] ? str(ref.kind)! : "Service";
        const meta = BACKEND_REF_KINDS[kind];
        const isAgb = !!meta.group;
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(i, v)}>
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(BACKEND_REF_KINDS).map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                {meta.resourceId !== "services" ? (
                  <ResourcePicker
                    resourceId={meta.resourceId}
                    allowFreeText
                    namespace={str(ref.namespace) ?? namespace}
                    value={str(ref.name)}
                    onChange={(v) => onChange(setAtPath(doc, [...basePath, i, "name"], v))}
                  />
                ) : (
                  <ServicePicker
                    namespace={str(ref.namespace) ?? namespace}
                    value={str(ref.name)}
                    onChange={(v) => onChange(setAtPath(doc, [...basePath, i, "name"], v))}
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{isAgb ? "Port (optional)" : "Port"}</Label>
                <Input
                  type="number"
                  className="h-8 text-sm"
                  value={num(ref.port) ?? ""}
                  placeholder={isAgb ? "" : "80"}
                  onChange={(e) =>
                    setOrDelete([...basePath, i, "port"], numberOrUndefined(e.target.value))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Weight (optional)</Label>
                <Input
                  type="number"
                  className="h-8 text-sm"
                  value={num(ref.weight) ?? ""}
                  placeholder="1"
                  onChange={(e) =>
                    setOrDelete([...basePath, i, "weight"], numberOrUndefined(e.target.value))
                  }
                />
              </div>
            </div>
            <RemoveRowButton
              onClick={() => onChange(deleteAtPath(doc, [...basePath, i]))}
              label={`Remove backend ${str(ref.name) ?? i}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export function HttpRouteForm({ doc, onChange }: ResourceFormProps) {
  const rules = rows(getAtPath(doc, ["spec", "rules"]));

  function setOrDelete(path: Path, value: unknown) {
    if (value === undefined || value === "") onChange(deleteAtPath(doc, path));
    else onChange(setAtPath(doc, path, value));
  }

  function addRule() {
    onChange(
      setAtPath(doc, ["spec", "rules"], [
        ...rules,
        { matches: [{ path: { type: "PathPrefix", value: "/" } }], backendRefs: [] },
      ]),
    );
  }

  return (
    <>
      <ParentRefsSection doc={doc} onChange={onChange} />

      <FormSection title="Hostnames" description="Hostnames this route matches (optional).">
        <StringListEditor
          values={strings(getAtPath(doc, ["spec", "hostnames"]))}
          onChange={(values) =>
            values.length === 0
              ? onChange(deleteAtPath(doc, ["spec", "hostnames"]))
              : onChange(setAtPath(doc, ["spec", "hostnames"], values))
          }
          placeholder="app.example.com"
        />
      </FormSection>

      <FormSection
        title="Rules"
        description="Match requests and forward them to backends."
        actions={
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={addRule}>
            <Plus className="size-3.5" />
            Add rule
          </Button>
        }
      >
        {rules.length === 0 && <p className="text-xs text-muted-foreground">No rules yet.</p>}
        {rules.map((rule, ri) => {
          const matches = rows(rule.matches);
          const filters = Array.isArray(rule.filters) ? rule.filters : [];
          return (
            <div key={ri} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Rule {ri + 1}</span>
                <RemoveRowButton
                  onClick={() => onChange(deleteAtPath(doc, ["spec", "rules", ri]))}
                  label={`Remove rule ${ri + 1}`}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Matches</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      onChange(
                        setAtPath(doc, ["spec", "rules", ri, "matches"], [
                          ...matches,
                          { path: { type: "PathPrefix", value: "/" } },
                        ]),
                      )
                    }
                  >
                    <Plus className="size-3.5" />
                    Add match
                  </Button>
                </div>
                {matches.length === 0 && (
                  <p className="text-xs text-muted-foreground">No matches (matches everything).</p>
                )}
                {matches.map((m, mi) => {
                  const pathType = str(getAtPath(m, ["path", "type"]));
                  const headers = Array.isArray(m.headers) ? m.headers : [];
                  return (
                    <div key={mi} className="flex items-start gap-2">
                      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Path type</Label>
                          <Select
                            value={pathType ?? ""}
                            onValueChange={(v) =>
                              onChange(
                                setAtPath(doc, ["spec", "rules", ri, "matches", mi, "path", "type"], v),
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-full text-sm">
                              <SelectValue placeholder="PathPrefix" />
                            </SelectTrigger>
                            <SelectContent>
                              {pathType && !PATH_TYPES.includes(pathType) && (
                                <SelectItem value={pathType}>{pathType}</SelectItem>
                              )}
                              {PATH_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Path value</Label>
                          <Input
                            className="h-8 font-mono text-sm"
                            value={str(getAtPath(m, ["path", "value"])) ?? ""}
                            placeholder="/"
                            onChange={(e) =>
                              onChange(
                                setAtPath(
                                  doc,
                                  ["spec", "rules", ri, "matches", mi, "path", "value"],
                                  e.target.value,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Method (optional)</Label>
                          <Select
                            value={str(m.method) ?? ANY_METHOD}
                            onValueChange={(v) =>
                              setOrDelete(
                                ["spec", "rules", ri, "matches", mi, "method"],
                                v === ANY_METHOD ? undefined : v,
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-full text-sm">
                              <SelectValue placeholder="Any" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={ANY_METHOD}>Any</SelectItem>
                              {METHODS.map((meth) => (
                                <SelectItem key={meth} value={meth}>
                                  {meth}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {headers.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {headers.length} header match{headers.length === 1 ? "" : "es"} — edit
                              in YAML.
                            </p>
                          )}
                        </div>
                      </div>
                      <RemoveRowButton
                        onClick={() =>
                          onChange(deleteAtPath(doc, ["spec", "rules", ri, "matches", mi]))
                        }
                        label={`Remove match ${mi + 1}`}
                      />
                    </div>
                  );
                })}
              </div>

              <BackendRefsEditor doc={doc} onChange={onChange} rulePath={["spec", "rules", ri]} />

              {filters.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {filters.length} filter{filters.length === 1 ? "" : "s"} — edit filters in YAML.
                </p>
              )}
            </div>
          );
        })}
      </FormSection>
    </>
  );
}
