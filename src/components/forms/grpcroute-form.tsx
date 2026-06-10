"use client";

import { Plus } from "lucide-react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import {
  BackendRefsEditor,
  ParentRefsSection,
  rows,
  str,
  strings,
} from "@/components/forms/httproute-form";
import { FormSection, RemoveRowButton, StringListEditor } from "@/components/forms/shared";
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

const METHOD_TYPES = ["Exact", "RegularExpression"];
/** Radix Select items can't have an empty value; sentinel for "default match type". */
const DEFAULT_TYPE = "__default__";

export function GrpcRouteForm({ doc, onChange }: ResourceFormProps) {
  const rules = rows(getAtPath(doc, ["spec", "rules"]));

  /** Set/clear a method.* field; drops the method object once it's empty. */
  function setMethodField(ri: number, mi: number, key: string, value: string | undefined) {
    const base: Path = ["spec", "rules", ri, "matches", mi, "method"];
    let next =
      value === undefined || value === ""
        ? deleteAtPath(doc, [...base, key])
        : setAtPath(doc, [...base, key], value);
    const method = getAtPath(next, base);
    if (method && typeof method === "object" && Object.keys(method).length === 0) {
      next = deleteAtPath(next, base);
    }
    onChange(next);
  }

  function addRule() {
    onChange(setAtPath(doc, ["spec", "rules"], [...rules, { matches: [{}], backendRefs: [] }]));
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
          placeholder="grpc.example.com"
        />
      </FormSection>

      <FormSection
        title="Rules"
        description="Match gRPC calls and forward them to backends."
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
                      onChange(setAtPath(doc, ["spec", "rules", ri, "matches"], [...matches, {}]))
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
                  const methodType = str(getAtPath(m, ["method", "type"]));
                  const headers = Array.isArray(m.headers) ? m.headers : [];
                  return (
                    <div key={mi} className="flex items-start gap-2">
                      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Service (optional)</Label>
                          <Input
                            className="h-8 font-mono text-sm"
                            value={str(getAtPath(m, ["method", "service"])) ?? ""}
                            placeholder="helloworld.Greeter"
                            onChange={(e) => setMethodField(ri, mi, "service", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Method (optional)</Label>
                          <Input
                            className="h-8 font-mono text-sm"
                            value={str(getAtPath(m, ["method", "method"])) ?? ""}
                            placeholder="SayHello"
                            onChange={(e) => setMethodField(ri, mi, "method", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Match type (optional)</Label>
                          <Select
                            value={methodType ?? DEFAULT_TYPE}
                            onValueChange={(v) =>
                              setMethodField(ri, mi, "type", v === DEFAULT_TYPE ? undefined : v)
                            }
                          >
                            <SelectTrigger className="h-8 w-full text-sm">
                              <SelectValue placeholder="Exact (default)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={DEFAULT_TYPE}>Default</SelectItem>
                              {methodType && !METHOD_TYPES.includes(methodType) && (
                                <SelectItem value={methodType}>{methodType}</SelectItem>
                              )}
                              {METHOD_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
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
