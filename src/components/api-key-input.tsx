"use client";

import { Check, Copy, Eye, EyeOff, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generateApiKey } from "@/lib/generate-key";

/**
 * Write-only secret input: paste a provider key, or generate a random one
 * for gateway-issued credentials. Generated keys are revealed so they can
 * be copied — they're unrecoverable once the dialog closes.
 */
export function ApiKeyInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function generate() {
    onChange(generateApiKey());
    setVisible(true);
  }

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-… or generate"
          className="flex-1 font-mono text-xs"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide key" : "Show key"}
            >
              {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{visible ? "Hide" : "Show"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={copy}
              disabled={!value}
              aria-label="Copy key"
            >
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 shrink-0"
          onClick={generate}
        >
          <Sparkles className="size-3.5" />
          Generate
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Generate creates a random gateway credential; for providers (OpenAI, Anthropic, …) paste
        their key. Copy it now — it can&apos;t be viewed again after saving.
      </p>
    </div>
  );
}
