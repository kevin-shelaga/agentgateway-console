"use client";

import { X } from "lucide-react";
import { useState } from "react";
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
import { useNamespaces } from "@/lib/hooks";
import type { K8sResource, ResourceDescriptor } from "@/lib/types";

export function MetadataFields({
  desc,
  doc,
  mode,
  onChange,
}: {
  desc: ResourceDescriptor;
  doc: K8sResource;
  mode: "create" | "update";
  onChange: (doc: K8sResource) => void;
}) {
  const { data: namespaces } = useNamespaces();
  const [labelDraft, setLabelDraft] = useState("");
  const labels = doc.metadata.labels ?? {};

  function patchMetadata(patch: Partial<K8sResource["metadata"]>) {
    onChange({ ...doc, metadata: { ...doc.metadata, ...patch } });
  }

  function addLabel() {
    const eq = labelDraft.indexOf("=");
    if (eq <= 0) return;
    const key = labelDraft.slice(0, eq).trim();
    const value = labelDraft.slice(eq + 1).trim();
    if (!key) return;
    patchMetadata({ labels: { ...labels, [key]: value } });
    setLabelDraft("");
  }

  function removeLabel(key: string) {
    const { [key]: _removed, ...rest } = labels;
    patchMetadata({ labels: Object.keys(rest).length ? rest : undefined });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="meta-name">Name</Label>
        <Input
          id="meta-name"
          value={doc.metadata.name}
          disabled={mode === "update"}
          onChange={(e) => patchMetadata({ name: e.target.value })}
          className="font-mono text-sm"
          placeholder="my-resource"
        />
      </div>

      {desc.scope === "Namespaced" && (
        <div className="space-y-1.5">
          <Label>Namespace</Label>
          {mode === "update" ? (
            <Input value={doc.metadata.namespace ?? ""} disabled className="font-mono text-sm" />
          ) : (
            <Select
              value={doc.metadata.namespace ?? ""}
              onValueChange={(ns) => patchMetadata({ namespace: ns })}
            >
              <SelectTrigger className="w-full font-mono text-sm">
                <SelectValue placeholder="Select namespace" />
              </SelectTrigger>
              <SelectContent>
                {(namespaces ?? []).map((ns) => (
                  <SelectItem
                    key={ns.metadata.name}
                    value={ns.metadata.name}
                    className="font-mono text-xs"
                  >
                    {ns.metadata.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="meta-labels">Labels</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(labels).map(([k, v]) => (
            <Badge key={k} variant="secondary" className="gap-1 pr-1 font-mono text-[11px] font-normal">
              {k}={v}
              <button
                type="button"
                onClick={() => removeLabel(k)}
                className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remove label ${k}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              id="meta-labels"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
              placeholder="key=value"
              className="h-7 w-44 font-mono text-xs"
            />
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={addLabel}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
