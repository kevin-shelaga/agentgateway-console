"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, SendHorizonal, ShieldOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { testLlm, type LlmTestResult } from "@/lib/api-client";
import { useResourceList, useResourceListOptional } from "@/lib/hooks";
import { defaultModel, resolveLlmEndpoints, suggestUrl } from "@/lib/llm-endpoints";
import { backendType, getResource } from "@/lib/registry";
import { cn } from "@/lib/utils";

function extractAssistantText(body: unknown): string | null {
  const choices = (body as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

function extractUsage(body: unknown): string | null {
  const usage = (body as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })?.usage;
  if (!usage) return null;
  const parts = [
    usage.prompt_tokens !== undefined && `${usage.prompt_tokens} in`,
    usage.completion_tokens !== undefined && `${usage.completion_tokens} out`,
    usage.total_tokens !== undefined && `${usage.total_tokens} total`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function LlmPanel() {
  const backendsDesc = getResource("backends")!;
  const { data: backends } = useResourceList(backendsDesc);
  const { data: entBackends } = useResourceListOptional(getResource("ent-backends")!);
  const { data: httproutes } = useResourceList(getResource("httproutes")!);
  const { data: gateways } = useResourceList(getResource("gateways")!);

  const aiBackends = useMemo(
    () => [...(backends ?? []), ...(entBackends ?? [])].filter((b) => backendType(b) === "ai"),
    [backends, entBackends],
  );

  const [backendKey, setBackendKey] = useState<string>("");
  const backend = aiBackends.find(
    (b) => `${b.metadata.namespace}/${b.metadata.name}` === backendKey,
  );

  const endpoints = useMemo(
    () => (backend ? resolveLlmEndpoints(backend, httproutes ?? [], gateways ?? []) : []),
    [backend, httproutes, gateways],
  );

  const [url, setUrl] = useState("");
  const [hostname, setHostname] = useState("");
  const [model, setModel] = useState("");
  const [system, setSystem] = useState("");
  const [prompt, setPrompt] = useState("Say hello in five words.");
  const [authName, setAuthName] = useState("Authorization");
  const [authValue, setAuthValue] = useState("");
  const [insecureTls, setInsecureTls] = useState(false);
  const [result, setResult] = useState<LlmTestResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Seed url/host/model from the first resolved endpoint when a backend is picked.
  useEffect(() => {
    if (!backend) return;
    setModel(defaultModel(backend));
    const first = endpoints[0];
    if (first) {
      setUrl(suggestUrl(first));
      setHostname(first.hostname ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendKey, endpoints.length]);

  const send = useMutation({
    mutationFn: async () => {
      const messages = [
        ...(system.trim() ? [{ role: "system", content: system.trim() }] : []),
        { role: "user", content: prompt },
      ];
      return testLlm({
        url,
        hostname: hostname || undefined,
        authHeader: authValue ? { name: authName, value: authValue } : undefined,
        insecureTls,
        body: { model: model || undefined, messages },
      });
    },
    onSuccess: setResult,
  });

  const assistantText = result ? extractAssistantText(result.body) : null;
  const usage = result ? extractUsage(result.body) : null;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">AI backend</Label>
              <Select value={backendKey} onValueChange={setBackendKey}>
                <SelectTrigger className="w-full font-mono text-xs">
                  <SelectValue placeholder={aiBackends.length ? "Select backend" : "No AI backends found"} />
                </SelectTrigger>
                <SelectContent>
                  {aiBackends.map((b) => (
                    <SelectItem
                      key={`${b.metadata.namespace}/${b.metadata.name}`}
                      value={`${b.metadata.namespace}/${b.metadata.name}`}
                      className="font-mono text-xs"
                    >
                      {b.metadata.namespace}/{b.metadata.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="from request body"
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          {backend && endpoints.length === 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
              No route → gateway → address chain found for this backend. Enter the URL manually
              (e.g. a port-forward).
            </p>
          )}
          {endpoints.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {endpoints.map((endpoint, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setUrl(suggestUrl(endpoint));
                    setHostname(endpoint.hostname ?? "");
                  }}
                  className="cursor-pointer"
                >
                  <Badge variant="outline" className="font-mono text-[10px] font-normal hover:border-primary">
                    {suggestUrl(endpoint)}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://<gateway-address>/v1/chat/completions"
              className="h-9 font-mono text-xs"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Host header (route hostname)</Label>
              <Input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="optional"
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Auth header</Label>
              <div className="flex gap-1.5">
                <Select value={authName} onValueChange={setAuthName}>
                  <SelectTrigger className="h-9 w-36 font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Authorization", "x-api-key", "api-key"].map((h) => (
                      <SelectItem key={h} value={h} className="font-mono text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="password"
                  value={authValue}
                  onChange={(e) => setAuthValue(e.target.value)}
                  placeholder="optional"
                  className="h-9 flex-1 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">System prompt</Label>
            <Textarea
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              placeholder="optional"
              rows={2}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={insecureTls}
                onCheckedChange={setInsecureTls}
                aria-label="Skip TLS verification"
              />
              <ShieldOff className={cn("size-3.5", insecureTls && "text-warning")} />
              Skip TLS verification (insecure — self-signed gateway certs only)
            </label>
            <Button onClick={() => send.mutate()} disabled={!url || !prompt || send.isPending}>
              {send.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizonal className="size-4" />
              )}
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="xl:sticky xl:top-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Response</CardTitle>
          {result && (
            <span className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "status-dot",
                  result.ok ? "status-dot-healthy" : "status-dot-degraded",
                )}
              />
              <span className={result.ok ? "text-success" : "text-destructive"}>
                {result.status > 0 ? `${result.status} ${result.statusText}` : "network error"}
              </span>
              <span className="text-muted-foreground tabular-nums">{result.durationMs}ms</span>
              {usage && <span className="text-muted-foreground">{usage}</span>}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {send.isPending ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Waiting for the gateway…</p>
          ) : !result ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Pick an AI backend and send a message — the call goes through the real gateway, so
              policies, auth, and provider config are all exercised.
            </p>
          ) : (
            <div className="space-y-3">
              {assistantText !== null ? (
                <div className="rounded-lg border bg-accent/30 px-3.5 py-3 text-sm whitespace-pre-wrap">
                  {assistantText}
                </div>
              ) : (
                <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
                  {typeof result.body === "string"
                    ? result.body
                    : JSON.stringify(result.body, null, 2)}
                </pre>
              )}
              {assistantText !== null && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showRaw ? "Hide" : "Show"} raw response
                  </button>
                  {showRaw && (
                    <pre className="mt-2 max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
                      {JSON.stringify(result.body, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
