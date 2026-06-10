"use client";

import { Plus } from "lucide-react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { ServicePicker } from "@/components/forms/pickers";
import { FormSection, numberOrUndefined, RemoveRowButton } from "@/components/forms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { deleteAtPath, getAtPath, setAtPath, type Path } from "@/lib/object-path";
import { asNumberString, asString, Field, rec, YamlOnlyNote, type Rec } from "./util";

type TargetKind = "host" | "service" | "selector";

const DEFAULT_SENTINEL = "__default__";

function targetKind(target: Rec): TargetKind {
  if (target.selector !== undefined) return "selector";
  if (rec(target.static).backendRef !== undefined) return "service";
  return "host";
}

export function McpSection({ doc, onChange, namespace }: ResourceFormProps & { namespace?: string }) {
  const mcp = rec(getAtPath(doc, ["spec", "mcp"]));
  const targets = Array.isArray(mcp.targets) ? mcp.targets : [];

  function addTarget() {
    const next = [...targets, { name: `target-${targets.length + 1}`, static: { host: "", port: 80 } }];
    onChange(setAtPath(doc, ["spec", "mcp", "targets"], next));
  }

  /** Set or delete an optional enum-ish field on spec.mcp itself. */
  function setMcpEnum(key: string, value: string) {
    onChange(
      value === DEFAULT_SENTINEL
        ? deleteAtPath(doc, ["spec", "mcp", key])
        : setAtPath(doc, ["spec", "mcp", key], value),
    );
  }

  return (
    <FormSection
      title="MCP targets"
      description="MCP servers aggregated by this backend (spec.mcp.targets)."
      actions={
        <Button type="button" variant="outline" size="sm" className="h-7" onClick={addTarget}>
          <Plus className="size-3.5" /> Add target
        </Button>
      }
    >
      {targets.length === 0 && (
        <p className="text-xs text-muted-foreground">No targets yet. At least one target is required.</p>
      )}
      {targets.map((t, i) => (
        <TargetRow
          key={i}
          doc={doc}
          onChange={onChange}
          target={rec(t)}
          index={i}
          namespace={namespace}
        />
      ))}

      <Separator />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Session routing" hint="Defaults to Stateful.">
          <Select
            value={asString(mcp.sessionRouting) || DEFAULT_SENTINEL}
            onValueChange={(v) => setMcpEnum("sessionRouting", v)}
          >
            <SelectTrigger className="w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_SENTINEL}>Default (Stateful)</SelectItem>
              <SelectItem value="Stateful">Stateful</SelectItem>
              <SelectItem value="Stateless">Stateless</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Failure mode" hint="Defaults to FailClosed.">
          <Select
            value={asString(mcp.failureMode) || DEFAULT_SENTINEL}
            onValueChange={(v) => setMcpEnum("failureMode", v)}
          >
            <SelectTrigger className="w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_SENTINEL}>Default (FailClosed)</SelectItem>
              <SelectItem value="FailClosed">FailClosed</SelectItem>
              <SelectItem value="FailOpen">FailOpen</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </FormSection>
  );
}

function TargetRow({
  doc,
  onChange,
  target,
  index,
  namespace,
}: ResourceFormProps & { target: Rec; index: number; namespace?: string }) {
  const base: Path = ["spec", "mcp", "targets", index];
  const kind = targetKind(target);
  const st = rec(target.static);

  function set(path: Path, value: unknown) {
    onChange(setAtPath(doc, [...base, ...path], value));
  }
  function setOpt(path: Path, value: string | number | undefined) {
    const full = [...base, ...path];
    onChange(value === undefined || value === "" ? deleteAtPath(doc, full) : setAtPath(doc, full, value));
  }
  function remove() {
    onChange(deleteAtPath(doc, base));
  }

  function switchKind(next: TargetKind) {
    if (next === kind) return;
    const name = asString(target.name);
    const replaced: Rec =
      next === "selector"
        ? { name, selector: { services: { matchLabels: {} } } }
        : next === "service"
          ? { name, static: { backendRef: { name: "" }, port: 80 } }
          : { name, static: { host: "", port: 80 } };
    onChange(setAtPath(doc, base, replaced));
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-end gap-2">
        <Field label="Name" className="flex-1">
          <Input
            className="font-mono text-sm"
            value={asString(target.name)}
            onChange={(e) => set(["name"], e.target.value)}
          />
        </Field>
        <Field label="Type" className="w-44">
          <Select value={kind} onValueChange={(v) => switchKind(v as TargetKind)}>
            <SelectTrigger className="w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="host">Static host</SelectItem>
              <SelectItem value="service">Service reference</SelectItem>
              <SelectItem value="selector">Label selector</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <RemoveRowButton onClick={remove} label={`Remove target ${asString(target.name)}`} />
      </div>

      {kind === "selector" ? (
        <YamlOnlyNote>
          Label selectors (<span className="font-mono">selector.services</span> /{" "}
          <span className="font-mono">selector.namespaces</span>) are edited in YAML.
        </YamlOnlyNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {kind === "host" ? (
              <Field label="Host">
                <Input
                  className="font-mono text-sm"
                  placeholder="mcp.example.com"
                  value={asString(st.host)}
                  onChange={(e) => set(["static", "host"], e.target.value)}
                />
              </Field>
            ) : (
              <Field label="Service">
                <ServicePicker
                  namespace={namespace}
                  value={asString(rec(st.backendRef).name) || undefined}
                  onChange={(v) => set(["static", "backendRef", "name"], v)}
                />
              </Field>
            )}
            <Field label="Port">
              <Input
                type="number"
                className="font-mono text-sm"
                value={asNumberString(st.port)}
                onChange={(e) => setOpt(["static", "port"], numberOrUndefined(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Path" hint="Defaults to /mcp (StreamableHTTP) or /sse (SSE).">
              <Input
                className="font-mono text-sm"
                placeholder="/mcp"
                value={asString(st.path)}
                onChange={(e) => setOpt(["static", "path"], e.target.value)}
              />
            </Field>
            <Field label="Protocol">
              <Select
                value={asString(st.protocol) || DEFAULT_SENTINEL}
                onValueChange={(v) =>
                  v === DEFAULT_SENTINEL
                    ? onChange(deleteAtPath(doc, [...base, "static", "protocol"]))
                    : set(["static", "protocol"], v)
                }
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_SENTINEL}>Default (StreamableHTTP)</SelectItem>
                  <SelectItem value="StreamableHTTP">StreamableHTTP</SelectItem>
                  <SelectItem value="SSE">SSE</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {st.policies !== undefined && (
            <YamlOnlyNote>This target has per-target policies configured in YAML.</YamlOnlyNote>
          )}
        </>
      )}
    </div>
  );
}
