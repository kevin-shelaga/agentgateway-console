"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { YamlEditor } from "@/components/yaml-editor";
import { Button } from "@/components/ui/button";

export function YamlView({ yaml }: { yaml: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 z-10 size-7"
        onClick={copy}
        aria-label="Copy YAML"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </Button>
      <YamlEditor value={yaml} onChange={() => {}} readOnly height="auto" />
    </div>
  );
}
