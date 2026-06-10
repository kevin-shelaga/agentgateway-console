"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResourceList } from "@/lib/hooks";
import { ALL_RESOURCES } from "@/lib/registry";
import type { ResourceDescriptor } from "@/lib/types";

function desc(id: string): ResourceDescriptor {
  return ALL_RESOURCES.find((r) => r.id === id)!;
}

/** Select populated from a live cluster list of the given registry kind. */
export function ResourcePicker({
  resourceId,
  namespace,
  value,
  onChange,
  placeholder,
  allowFreeText = false,
}: {
  resourceId: string;
  /** Restrict to a namespace (for Namespaced kinds). */
  namespace?: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show current value even if it's not in the cluster list. */
  allowFreeText?: boolean;
}) {
  const d = desc(resourceId);
  const { data, isLoading } = useResourceList(d, namespace);
  const names = (data ?? []).map((r) => r.metadata.name).sort();
  const showValueItem = allowFreeText && value && !names.includes(value);

  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className="w-full font-mono text-sm">
        <SelectValue
          placeholder={isLoading ? "Loading…" : (placeholder ?? `Select ${d.label.toLowerCase()}`)}
        />
      </SelectTrigger>
      <SelectContent>
        {showValueItem && (
          <SelectItem value={value} className="font-mono text-xs">
            {value}
          </SelectItem>
        )}
        {names.map((name) => (
          <SelectItem key={name} value={name} className="font-mono text-xs">
            {name}
          </SelectItem>
        ))}
        {!isLoading && names.length === 0 && !showValueItem && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No {d.labelPlural.toLowerCase()} found
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

export function SecretPicker(props: {
  namespace?: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return <ResourcePicker resourceId="secrets" allowFreeText {...props} />;
}

export function ServicePicker(props: {
  namespace?: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return <ResourcePicker resourceId="services" allowFreeText {...props} />;
}

export function GatewayPicker(props: {
  namespace?: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return <ResourcePicker resourceId="gateways" allowFreeText {...props} />;
}

export function GatewayClassPicker(props: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return <ResourcePicker resourceId="gatewayclasses" allowFreeText {...props} />;
}
