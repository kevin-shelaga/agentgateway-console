"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNamespaces } from "@/lib/hooks";

const ALL = "__all__";

export function NamespaceFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (namespace: string | undefined) => void;
}) {
  const { data: namespaces } = useNamespaces();
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL ? undefined : v)}
    >
      <SelectTrigger size="sm" className="w-52 font-mono text-xs">
        <SelectValue placeholder="All namespaces" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">
          All namespaces
        </SelectItem>
        {(namespaces ?? []).map((ns) => (
          <SelectItem key={ns.metadata.name} value={ns.metadata.name} className="font-mono text-xs">
            {ns.metadata.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
