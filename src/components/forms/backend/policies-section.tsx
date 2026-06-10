"use client";

import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { SecretPicker } from "@/components/forms/pickers";
import { FormSection } from "@/components/forms/shared";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteAtPath, getAtPath, setAtPath } from "@/lib/object-path";
import { asString, Field, rec, YamlOnlyNote, type Rec } from "./util";

type AuthMode = "none" | "secretRef" | "key" | "passthrough" | "cloud";

/** spec.policies keys the guided form does not edit. */
const YAML_ONLY_POLICY_KEYS = ["tcp", "tls", "http", "tunnel", "ai", "mcp", "transformation", "health"];

function authMode(auth: Rec): AuthMode {
  if (auth.aws !== undefined || auth.azure !== undefined || auth.gcp !== undefined) return "cloud";
  if (auth.secretRef !== undefined) return "secretRef";
  if (auth.key !== undefined) return "key";
  if (auth.passthrough !== undefined) return "passthrough";
  return "none";
}

export function PoliciesSection({
  doc,
  onChange,
  namespace,
}: ResourceFormProps & { namespace?: string }) {
  const policies = rec(getAtPath(doc, ["spec", "policies"]));
  const auth = rec(policies.auth);
  const mode = authMode(auth);
  const yamlOnly = YAML_ONLY_POLICY_KEYS.filter((k) => policies[k] !== undefined);

  function switchMode(next: AuthMode) {
    if (next === mode || next === "cloud") return;
    if (next === "none") {
      let updated = deleteAtPath(doc, ["spec", "policies", "auth"]);
      if (Object.keys(rec(getAtPath(updated, ["spec", "policies"]))).length === 0) {
        updated = deleteAtPath(updated, ["spec", "policies"]);
      }
      onChange(updated);
      return;
    }
    // Preserve location (and any other extras) while swapping the credential source.
    const replaced: Rec = { ...auth };
    delete replaced.key;
    delete replaced.secretRef;
    delete replaced.passthrough;
    if (next === "secretRef") replaced.secretRef = { name: "" };
    if (next === "key") replaced.key = "";
    if (next === "passthrough") replaced.passthrough = {};
    onChange(setAtPath(doc, ["spec", "policies", "auth"], replaced));
  }

  return (
    <FormSection
      title="Backend authentication"
      description="Credentials sent to the backend (spec.policies.auth)."
    >
      <Field label="Auth mode">
        <Select value={mode} onValueChange={(v) => switchMode(v as AuthMode)}>
          <SelectTrigger className="w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="secretRef">Secret reference</SelectItem>
            <SelectItem value="key">Inline key</SelectItem>
            <SelectItem value="passthrough">Passthrough client token</SelectItem>
            {mode === "cloud" && (
              <SelectItem value="cloud" disabled>
                Cloud auth (YAML)
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </Field>

      {mode === "secretRef" && (
        <Field
          label="Secret"
          hint="The Secret must store the credential under the Authorization key."
        >
          <SecretPicker
            namespace={namespace}
            value={asString(rec(auth.secretRef).name) || undefined}
            onChange={(v) => onChange(setAtPath(doc, ["spec", "policies", "auth", "secretRef", "name"], v))}
          />
        </Field>
      )}

      {mode === "key" && (
        <Field
          label="Inline key"
          hint="Stored in plain text on the resource; prefer a Secret reference."
        >
          <Input
            type="password"
            className="font-mono text-sm"
            value={asString(auth.key)}
            onChange={(e) => onChange(setAtPath(doc, ["spec", "policies", "auth", "key"], e.target.value))}
          />
        </Field>
      )}

      {mode === "passthrough" && (
        <p className="text-xs text-muted-foreground">
          The validated client token is re-attached to requests sent to the backend.
        </p>
      )}

      {mode === "cloud" && (
        <YamlOnlyNote>
          AWS / Azure / GCP backend authentication is configured in YAML.
        </YamlOnlyNote>
      )}

      {auth.location !== undefined && (
        <YamlOnlyNote>
          A custom credential location (<span className="font-mono">auth.location</span>) is
          configured in YAML.
        </YamlOnlyNote>
      )}

      {yamlOnly.length > 0 && (
        <YamlOnlyNote>
          Additional backend policies configured in YAML:{" "}
          <span className="font-mono">{yamlOnly.join(", ")}</span>
        </YamlOnlyNote>
      )}
    </FormSection>
  );
}
