"use client";

import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { ServicePicker } from "@/components/forms/pickers";
import { FormSection, numberOrUndefined } from "@/components/forms/shared";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteAtPath, getAtPath, setAtPath, type Path } from "@/lib/object-path";
import { asNumberString, asString, Field, rec, YamlOnlyNote, type Rec } from "./util";

const PROVIDER_KEYS = [
  "openai",
  "anthropic",
  "azureopenai",
  "azure",
  "gemini",
  "vertexai",
  "bedrock",
  "custom",
] as const;
type ProviderKey = (typeof PROVIDER_KEYS)[number];

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  azureopenai: "Azure OpenAI",
  azure: "Azure (resource)",
  gemini: "Gemini",
  vertexai: "Vertex AI",
  bedrock: "Bedrock",
  custom: "Custom",
};

const PROVIDER_DEFAULTS: Record<ProviderKey, Rec> = {
  openai: { model: "gpt-4o-mini" },
  anthropic: {},
  azureopenai: { endpoint: "" },
  azure: { resourceName: "", resourceType: "OpenAI" },
  gemini: {},
  vertexai: { projectId: "" },
  bedrock: { region: "us-east-1" },
  custom: { formats: [{ type: "Completions" }] },
};

const CUSTOM_FORMATS = [
  "Completions",
  "Messages",
  "Responses",
  "Embeddings",
  "AnthropicTokenCount",
  "Realtime",
] as const;

export function AiSection({ doc, onChange, namespace }: ResourceFormProps & { namespace?: string }) {
  const ai = rec(getAtPath(doc, ["spec", "ai"]));
  const groups = ai.groups;

  if (Array.isArray(groups)) {
    return (
      <FormSection
        title="AI provider"
        description="Priority groups of LLM providers (spec.ai.groups)."
      >
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">{groups.length} priority group(s)</Badge>
        </div>
        <YamlOnlyNote>
          Priority groups are edited in YAML. Remove <span className="font-mono">spec.ai.groups</span>{" "}
          to configure a single provider here instead.
        </YamlOnlyNote>
      </FormSection>
    );
  }

  const provider = rec(ai.provider);
  const current = PROVIDER_KEYS.find((k) => provider[k] !== undefined);
  const providerPath: Path = ["spec", "ai", "provider"];

  function switchProvider(next: ProviderKey) {
    if (next === current) return;
    const replaced: Rec = { ...provider };
    for (const k of PROVIDER_KEYS) delete replaced[k];
    replaced[next] = PROVIDER_DEFAULTS[next];
    onChange(setAtPath(doc, providerPath, replaced));
  }

  /** Set or (when value is empty) delete an optional string field under the provider. */
  function setOpt(path: Path, value: string | number | undefined) {
    const full = [...providerPath, ...path];
    onChange(value === undefined || value === "" ? deleteAtPath(doc, full) : setAtPath(doc, full, value));
  }
  /** Set a required string field under the provider (kept even when empty). */
  function setReq(path: Path, value: string) {
    onChange(setAtPath(doc, [...providerPath, ...path], value));
  }

  const cfg = current ? rec(provider[current]) : {};
  const leftovers: string[] = [];
  if (provider.path !== undefined) leftovers.push("path");
  if (provider.pathPrefix !== undefined) leftovers.push("pathPrefix");
  if (current === "bedrock" && cfg.guardrail !== undefined) leftovers.push("bedrock.guardrail");

  return (
    <FormSection
      title="AI provider"
      description="The LLM provider this backend routes requests to (spec.ai.provider)."
    >
      <Field label="Provider">
        <Select value={current ?? ""} onValueChange={(v) => switchProvider(v as ProviderKey)}>
          <SelectTrigger className="w-full text-sm">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_KEYS.map((k) => (
              <SelectItem key={k} value={k} className="text-sm">
                {PROVIDER_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {current && current !== "azureopenai" && (
        <Field
          label="Model"
          hint="Optional override; if unset, the model is taken from the request."
        >
          <Input
            className="font-mono text-sm"
            placeholder={
              current === "anthropic"
                ? "claude-sonnet-4-5"
                : current === "gemini" || current === "vertexai"
                  ? "gemini-2.5-pro"
                  : "gpt-4o-mini"
            }
            value={asString(cfg.model)}
            onChange={(e) => setOpt([current, "model"], e.target.value)}
          />
        </Field>
      )}

      {current === "azureopenai" && (
        <>
          <Field label="Endpoint" hint="Required, e.g. my-endpoint.openai.azure.com">
            <Input
              className="font-mono text-sm"
              value={asString(cfg.endpoint)}
              onChange={(e) => setReq(["azureopenai", "endpoint"], e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deployment name" hint="Required unless apiVersion is v1.">
              <Input
                className="font-mono text-sm"
                value={asString(cfg.deploymentName)}
                onChange={(e) => setOpt(["azureopenai", "deploymentName"], e.target.value)}
              />
            </Field>
            <Field label="API version" hint="Defaults to v1.">
              <Input
                className="font-mono text-sm"
                placeholder="v1"
                value={asString(cfg.apiVersion)}
                onChange={(e) => setOpt(["azureopenai", "apiVersion"], e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      {current === "azure" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Resource name" hint="Required Azure resource name.">
              <Input
                className="font-mono text-sm"
                value={asString(cfg.resourceName)}
                onChange={(e) => setReq(["azure", "resourceName"], e.target.value)}
              />
            </Field>
            <Field label="Resource type">
              <Select
                value={asString(cfg.resourceType) || "OpenAI"}
                onValueChange={(v) => setReq(["azure", "resourceType"], v)}
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OpenAI">OpenAI</SelectItem>
                  <SelectItem value="Foundry">Foundry</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project name" hint="Required when resource type is Foundry.">
              <Input
                className="font-mono text-sm"
                value={asString(cfg.projectName)}
                onChange={(e) => setOpt(["azure", "projectName"], e.target.value)}
              />
            </Field>
            <Field label="API version" hint="Defaults to v1.">
              <Input
                className="font-mono text-sm"
                placeholder="v1"
                value={asString(cfg.apiVersion)}
                onChange={(e) => setOpt(["azure", "apiVersion"], e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      {current === "vertexai" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project ID" hint="Required Google Cloud project.">
            <Input
              className="font-mono text-sm"
              value={asString(cfg.projectId)}
              onChange={(e) => setReq(["vertexai", "projectId"], e.target.value)}
            />
          </Field>
          <Field label="Region" hint="Defaults to global.">
            <Input
              className="font-mono text-sm"
              placeholder="global"
              value={asString(cfg.region)}
              onChange={(e) => setOpt(["vertexai", "region"], e.target.value)}
            />
          </Field>
        </div>
      )}

      {current === "bedrock" && (
        <Field label="Region" hint="Defaults to us-east-1.">
          <Input
            className="font-mono text-sm"
            placeholder="us-east-1"
            value={asString(cfg.region)}
            onChange={(e) => setOpt(["bedrock", "region"], e.target.value)}
          />
        </Field>
      )}

      {current === "custom" && (
        <CustomProviderFields
          cfg={cfg}
          namespace={namespace}
          setOpt={setOpt}
          onFormats={(formats) =>
            onChange(setAtPath(doc, [...providerPath, "custom", "formats"], formats))
          }
        />
      )}

      {current && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={current === "custom" ? "Host" : "Host override"}
            hint={
              current === "custom"
                ? "Target host (required unless backendRef is set)."
                : "Optional; overrides the provider default."
            }
          >
            <Input
              className="font-mono text-sm"
              value={asString(provider.host)}
              onChange={(e) => setOpt(["host"], e.target.value)}
            />
          </Field>
          <Field
            label={current === "custom" ? "Port" : "Port override"}
            hint="Set together with host."
          >
            <Input
              type="number"
              className="font-mono text-sm"
              value={asNumberString(provider.port)}
              onChange={(e) => setOpt(["port"], numberOrUndefined(e.target.value))}
            />
          </Field>
        </div>
      )}

      {leftovers.length > 0 && (
        <YamlOnlyNote>
          Also configured in YAML: <span className="font-mono">{leftovers.join(", ")}</span>
        </YamlOnlyNote>
      )}
    </FormSection>
  );
}

function CustomProviderFields({
  cfg,
  namespace,
  setOpt,
  onFormats,
}: {
  cfg: Rec;
  namespace?: string;
  setOpt: (path: Path, value: string | number | undefined) => void;
  onFormats: (formats: Rec[]) => void;
}) {
  const backendRef = rec(cfg.backendRef);
  const formats = Array.isArray(cfg.formats) ? cfg.formats.map(rec) : [];
  const formatHasExtras = formats.some(
    (f) => f.path !== undefined || (f.type !== undefined && !CUSTOM_FORMATS.includes(f.type as never)),
  );

  function toggleFormat(t: string) {
    const has = formats.some((f) => f.type === t);
    onFormats(has ? formats.filter((f) => f.type !== t) : [...formats, { type: t }]);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Backend Service" hint="Optional; otherwise set host and port below.">
          <ServicePicker
            namespace={namespace}
            value={asString(backendRef.name) || undefined}
            onChange={(v) => setOpt(["custom", "backendRef", "name"], v)}
          />
        </Field>
        <Field label="Service port" hint="Required for Service references.">
          <Input
            type="number"
            className="font-mono text-sm"
            value={asNumberString(backendRef.port)}
            onChange={(e) => setOpt(["custom", "backendRef", "port"], numberOrUndefined(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Supported formats" hint="Provider-native API formats (at least one).">
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_FORMATS.map((t) => {
            const active = formats.some((f) => f.type === t);
            return (
              <button key={t} type="button" onClick={() => toggleFormat(t)}>
                <Badge
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer text-[11px] font-normal"
                >
                  {t}
                </Badge>
              </button>
            );
          })}
        </div>
      </Field>
      {formatHasExtras && (
        <YamlOnlyNote>Some format entries have per-format path overrides; edit those in YAML.</YamlOnlyNote>
      )}
    </>
  );
}
