"use client";

import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { FormSection, numberOrUndefined } from "@/components/forms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAtPath, getAtPath, setAtPath, type Path } from "@/lib/object-path";
import { AiSection } from "./backend/ai-section";
import { McpSection } from "./backend/mcp-section";
import { PoliciesSection } from "./backend/policies-section";
import { asNumberString, asString, Field, rec, YamlOnlyNote, type Rec } from "./backend/util";

const BACKEND_TYPES = [
  { key: "ai", label: "AI / LLM" },
  { key: "mcp", label: "MCP" },
  { key: "static", label: "Static" },
  { key: "a2a", label: "A2A" },
  { key: "aws", label: "AWS" },
  { key: "dynamicForwardProxy", label: "Forward proxy" },
] as const;
type BackendType = (typeof BACKEND_TYPES)[number]["key"];

const TYPE_DEFAULTS: Record<BackendType, Rec> = {
  ai: { provider: { openai: { model: "gpt-4o-mini" } } },
  mcp: { targets: [] },
  static: { host: "", port: 80 },
  a2a: { host: "", port: 80 },
  aws: { agentCore: { agentRuntimeArn: "" } },
  dynamicForwardProxy: {},
};

const KNOWN_SPEC_KEYS = new Set<string>([...BACKEND_TYPES.map((t) => t.key), "policies"]);

export function BackendForm({ doc, onChange }: ResourceFormProps) {
  const spec = rec(doc.spec);
  const namespace =
    typeof doc.metadata?.namespace === "string" ? doc.metadata.namespace : undefined;
  const currentType = BACKEND_TYPES.find((t) => spec[t.key] !== undefined)?.key;
  const unknownKeys = Object.keys(spec).filter((k) => !KNOWN_SPEC_KEYS.has(k));

  function switchType(next: BackendType) {
    if (next === currentType) return;
    const newSpec: Rec = { [next]: TYPE_DEFAULTS[next] };
    if (spec.policies !== undefined) newSpec.policies = spec.policies;
    onChange({ ...doc, spec: newSpec });
  }

  return (
    <div className="space-y-4">
      <FormSection
        title="Backend type"
        description="Each backend configures exactly one destination type. Switching replaces the current type's configuration."
      >
        <div className="flex flex-wrap gap-1.5">
          {BACKEND_TYPES.map((t) => (
            <Button
              key={t.key}
              type="button"
              size="sm"
              className="h-7"
              variant={currentType === t.key ? "default" : "outline"}
              onClick={() => switchType(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        {!currentType && (
          <p className="text-xs text-muted-foreground">
            No backend type set yet — pick one above to get started.
          </p>
        )}
        {unknownKeys.length > 0 && (
          <YamlOnlyNote>
            Unrecognized spec fields (YAML only):{" "}
            <span className="font-mono">{unknownKeys.join(", ")}</span>
          </YamlOnlyNote>
        )}
      </FormSection>

      {currentType === "ai" && <AiSection doc={doc} onChange={onChange} namespace={namespace} />}
      {currentType === "mcp" && <McpSection doc={doc} onChange={onChange} namespace={namespace} />}
      {currentType === "static" && <StaticSection doc={doc} onChange={onChange} />}
      {currentType === "a2a" && <A2ASection doc={doc} onChange={onChange} />}
      {currentType === "aws" && <AwsSection doc={doc} onChange={onChange} />}
      {currentType === "dynamicForwardProxy" && (
        <FormSection
          title="Dynamic forward proxy"
          description="Requests are forwarded to the destination from the incoming HTTP Host header (or TLS SNI)."
        >
          <p className="text-xs text-muted-foreground">
            No configuration required. Ensure proper access controls are in place, since clients
            can steer traffic to arbitrary destinations.
          </p>
        </FormSection>
      )}

      <PoliciesSection doc={doc} onChange={onChange} namespace={namespace} />
    </div>
  );
}

/** Set a field, or delete it when the value is empty/undefined. */
function makeSetOpt(doc: ResourceFormProps["doc"], onChange: ResourceFormProps["onChange"]) {
  return (path: Path, value: string | number | undefined) =>
    onChange(
      value === undefined || value === "" ? deleteAtPath(doc, path) : setAtPath(doc, path, value),
    );
}

function StaticSection({ doc, onChange }: ResourceFormProps) {
  const st = rec(getAtPath(doc, ["spec", "static"]));
  const setOpt = makeSetOpt(doc, onChange);

  return (
    <FormSection
      title="Static backend"
      description="A fixed destination: host + port, or a Unix domain socket path (mutually exclusive)."
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Host">
          <Input
            className="font-mono text-sm"
            placeholder="example.com"
            value={asString(st.host)}
            onChange={(e) => onChange(setAtPath(doc, ["spec", "static", "host"], e.target.value))}
          />
        </Field>
        <Field label="Port">
          <Input
            type="number"
            className="font-mono text-sm"
            value={asNumberString(st.port)}
            onChange={(e) => setOpt(["spec", "static", "port"], numberOrUndefined(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Unix socket path" hint="Optional; mutually exclusive with host/port.">
        <Input
          className="font-mono text-sm"
          placeholder="/var/run/backend.sock"
          value={asString(st.unixPath)}
          onChange={(e) => setOpt(["spec", "static", "unixPath"], e.target.value)}
        />
      </Field>
    </FormSection>
  );
}

function A2ASection({ doc, onChange }: ResourceFormProps) {
  const a2a = rec(getAtPath(doc, ["spec", "a2a"]));

  return (
    <FormSection title="A2A backend" description="An Agent2Agent protocol destination.">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Host">
          <Input
            className="font-mono text-sm"
            placeholder="agent.example.com"
            value={asString(a2a.host)}
            onChange={(e) => onChange(setAtPath(doc, ["spec", "a2a", "host"], e.target.value))}
          />
        </Field>
        <Field label="Port">
          <Input
            type="number"
            className="font-mono text-sm"
            value={asNumberString(a2a.port)}
            onChange={(e) => {
              const n = numberOrUndefined(e.target.value);
              onChange(
                n === undefined
                  ? deleteAtPath(doc, ["spec", "a2a", "port"])
                  : setAtPath(doc, ["spec", "a2a", "port"], n),
              );
            }}
          />
        </Field>
      </div>
    </FormSection>
  );
}

function AwsSection({ doc, onChange }: ResourceFormProps) {
  const agentCore = rec(getAtPath(doc, ["spec", "aws", "agentCore"]));
  const setOpt = makeSetOpt(doc, onChange);

  return (
    <FormSection
      title="AWS AgentCore"
      description="Amazon Bedrock AgentCore runtime (spec.aws.agentCore)."
    >
      <Field label="Agent runtime ARN">
        <Input
          className="font-mono text-sm"
          placeholder="arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/my-agent"
          value={asString(agentCore.agentRuntimeArn)}
          onChange={(e) =>
            onChange(setAtPath(doc, ["spec", "aws", "agentCore", "agentRuntimeArn"], e.target.value))
          }
        />
      </Field>
      <Field label="Qualifier" hint="Optional alias or version qualifier.">
        <Input
          className="font-mono text-sm"
          value={asString(agentCore.qualifier)}
          onChange={(e) => setOpt(["spec", "aws", "agentCore", "qualifier"], e.target.value)}
        />
      </Field>
    </FormSection>
  );
}
