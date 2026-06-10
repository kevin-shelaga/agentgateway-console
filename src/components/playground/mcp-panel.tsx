"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Plug, ShieldOff, Wrench } from "lucide-react";
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
import { useResourceList } from "@/lib/hooks";
import { resolveLlmEndpoints, suggestMcpUrl } from "@/lib/llm-endpoints";
import { testMcp, type McpTestResult, type McpTool } from "@/lib/mcp-client";
import { backendType, getResource } from "@/lib/registry";
import { cn } from "@/lib/utils";

type FieldValue = string | boolean;

function schemaProperties(tool: McpTool): Record<string, Record<string, unknown>> {
  return tool.inputSchema?.properties ?? {};
}

function emptyFields(tool: McpTool): Record<string, FieldValue> {
  return Object.fromEntries(
    Object.entries(schemaProperties(tool)).map(([key, prop]) => [
      key,
      prop.type === "boolean" ? false : "",
    ]),
  );
}

export function McpPanel() {
  const backendsDesc = getResource("backends")!;
  const { data: backends } = useResourceList(backendsDesc);
  const { data: httproutes } = useResourceList(getResource("httproutes")!);
  const { data: gateways } = useResourceList(getResource("gateways")!);

  const mcpBackends = useMemo(
    () => (backends ?? []).filter((b) => backendType(b) === "mcp"),
    [backends],
  );

  const [backendKey, setBackendKey] = useState<string>("");
  const backend = mcpBackends.find(
    (b) => `${b.metadata.namespace}/${b.metadata.name}` === backendKey,
  );

  const endpoints = useMemo(
    () => (backend ? resolveLlmEndpoints(backend, httproutes ?? [], gateways ?? []) : []),
    [backend, httproutes, gateways],
  );

  const [url, setUrl] = useState("");
  const [hostname, setHostname] = useState("");
  const [authName, setAuthName] = useState("Authorization");
  const [authValue, setAuthValue] = useState("");
  const [insecureTls, setInsecureTls] = useState(false);
  const [listResult, setListResult] = useState<McpTestResult | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, FieldValue>>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawArgs, setRawArgs] = useState("{}");
  const [callResult, setCallResult] = useState<McpTestResult | null>(null);

  // Seed url/host from the first resolved endpoint when a backend is picked.
  useEffect(() => {
    if (!backend) return;
    const first = endpoints[0];
    if (first) {
      setUrl(suggestMcpUrl(first));
      setHostname(first.hostname ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendKey, endpoints.length]);

  const common = () => ({
    url,
    hostname: hostname || undefined,
    authHeader: authValue ? { name: authName, value: authValue } : undefined,
    insecureTls,
  });

  const connect = useMutation({
    mutationFn: async () => testMcp({ ...common(), action: "listTools" }),
    onSuccess: (result) => {
      setListResult(result);
      setSelectedTool(null);
      setCallResult(null);
    },
  });

  const tools = listResult?.tools ?? [];
  const tool = tools.find((t) => t.name === selectedTool);
  const properties = tool ? schemaProperties(tool) : {};

  function buildArgs(): Record<string, unknown> {
    if (rawMode) {
      const text = rawArgs.trim();
      return text ? (JSON.parse(text) as Record<string, unknown>) : {};
    }
    const args: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const value = fields[key];
      if (prop.type === "boolean") {
        args[key] = value === true;
        continue;
      }
      if (typeof value !== "string" || value === "") continue;
      if (prop.type === "number" || prop.type === "integer") args[key] = Number(value);
      else if (prop.type === "string") args[key] = value;
      else args[key] = JSON.parse(value);
    }
    return args;
  }

  const call = useMutation({
    mutationFn: async () => {
      let args: Record<string, unknown>;
      try {
        args = buildArgs();
      } catch (err) {
        throw new Error(`invalid JSON arguments: ${err instanceof Error ? err.message : err}`);
      }
      return testMcp({ ...common(), action: "callTool", toolName: tool!.name, args });
    },
    onMutate: () => setCallResult(null),
    onSuccess: setCallResult,
  });

  function pickTool(t: McpTool) {
    setSelectedTool(t.name);
    setFields(emptyFields(t));
    setRawMode(false);
    setRawArgs("{}");
    setCallResult(null);
    call.reset();
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">MCP backend</Label>
            <Select value={backendKey} onValueChange={setBackendKey}>
              <SelectTrigger className="w-full font-mono text-xs">
                <SelectValue placeholder={mcpBackends.length ? "Select backend" : "No MCP backends found"} />
              </SelectTrigger>
              <SelectContent>
                {mcpBackends.map((b) => (
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
                    setUrl(suggestMcpUrl(endpoint));
                    setHostname(endpoint.hostname ?? "");
                  }}
                  className="cursor-pointer"
                >
                  <Badge variant="outline" className="font-mono text-[10px] font-normal hover:border-primary">
                    {suggestMcpUrl(endpoint)}
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
              placeholder="https://<gateway-address>/mcp"
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
            <Button onClick={() => connect.mutate()} disabled={!url || connect.isPending}>
              {connect.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plug className="size-4" />
              )}
              Connect & list tools
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="xl:sticky xl:top-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Tools</CardTitle>
          {listResult && (
            <span className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "status-dot",
                  listResult.ok ? "status-dot-healthy" : "status-dot-degraded",
                )}
              />
              <span className={listResult.ok ? "text-success" : "text-destructive"}>
                {listResult.ok ? `${tools.length} tool(s)` : "connection failed"}
              </span>
              <span className="text-muted-foreground tabular-nums">{listResult.durationMs}ms</span>
            </span>
          )}
        </CardHeader>
        <CardContent>
          {connect.isPending ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Connecting through the gateway…</p>
          ) : connect.error ? (
            <pre className="max-h-80 overflow-auto rounded-lg border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
              {connect.error.message}
            </pre>
          ) : !listResult ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Pick an MCP backend and connect — the session is established through the real
              gateway, so routing, policies, and auth are all exercised.
            </p>
          ) : !listResult.ok ? (
            <pre className="max-h-80 overflow-auto rounded-lg border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
              {listResult.error}
            </pre>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {tools.map((t) => (
                  <div
                    key={t.name}
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      t.name === selectedTool && "border-primary bg-accent/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => pickTool(t)}
                        className="flex-1 cursor-pointer text-left"
                      >
                        <span className="flex items-center gap-1.5 font-mono text-xs font-medium">
                          <Wrench className="size-3.5 text-primary" />
                          {t.name}
                        </span>
                        {t.description && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{t.description}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedSchema((v) => (v === t.name ? null : t.name))}
                        className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                      >
                        {expandedSchema === t.name ? "Hide" : "Show"} schema
                      </button>
                    </div>
                    {expandedSchema === t.name && (
                      <pre className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[10px] whitespace-pre-wrap">
                        {JSON.stringify(schemaProperties(t), null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
                {tools.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">The server exposed no tools.</p>
                )}
              </div>

              {tool && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium">{tool.name} arguments</span>
                    <button
                      type="button"
                      onClick={() => setRawMode((v) => !v)}
                      className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                    >
                      {rawMode ? "Use form" : "Edit raw JSON"}
                    </button>
                  </div>

                  {rawMode ? (
                    <Textarea
                      value={rawArgs}
                      onChange={(e) => setRawArgs(e.target.value)}
                      rows={5}
                      aria-label="Raw JSON arguments"
                      className="font-mono text-xs"
                    />
                  ) : Object.keys(properties).length === 0 ? (
                    <p className="text-xs text-muted-foreground">This tool takes no arguments.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.entries(properties).map(([key, prop]) => {
                        const required = tool.inputSchema?.required?.includes(key);
                        const label = (
                          <Label className="text-xs">
                            <span className="font-mono">{key}</span>
                            {required && <span className="text-destructive">*</span>}
                            {typeof prop.description === "string" && (
                              <span className="font-normal text-muted-foreground"> — {prop.description}</span>
                            )}
                          </Label>
                        );
                        if (prop.type === "boolean") {
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <Switch
                                checked={fields[key] === true}
                                onCheckedChange={(v) => setFields((f) => ({ ...f, [key]: v }))}
                                aria-label={key}
                              />
                              {label}
                            </div>
                          );
                        }
                        if (prop.type === "string" || prop.type === "number" || prop.type === "integer") {
                          return (
                            <div key={key} className="space-y-1.5">
                              {label}
                              <Input
                                type={prop.type === "string" ? "text" : "number"}
                                value={typeof fields[key] === "string" ? (fields[key] as string) : ""}
                                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                                aria-label={key}
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                          );
                        }
                        return (
                          <div key={key} className="space-y-1.5">
                            {label}
                            <Textarea
                              value={typeof fields[key] === "string" ? (fields[key] as string) : ""}
                              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                              rows={3}
                              placeholder="JSON"
                              aria-label={key}
                              className="font-mono text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button onClick={() => call.mutate()} disabled={call.isPending}>
                      {call.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Wrench className="size-4" />
                      )}
                      Call tool
                    </Button>
                  </div>

                  {call.error && (
                    <pre className="max-h-80 overflow-auto rounded-lg border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
                      {call.error.message}
                    </pre>
                  )}

                  {callResult && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={cn(
                            "status-dot",
                            callResult.ok && !callResult.result?.isError
                              ? "status-dot-healthy"
                              : "status-dot-degraded",
                          )}
                        />
                        <span
                          className={
                            callResult.ok && !callResult.result?.isError
                              ? "text-success"
                              : "text-destructive"
                          }
                        >
                          {!callResult.ok ? "call failed" : callResult.result?.isError ? "tool error" : "ok"}
                        </span>
                        <span className="text-muted-foreground tabular-nums">{callResult.durationMs}ms</span>
                      </div>
                      {!callResult.ok ? (
                        <pre className="max-h-80 overflow-auto rounded-lg border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
                          {callResult.error}
                        </pre>
                      ) : (
                        (callResult.result?.content ?? []).map((block, i) =>
                          block.type === "text" ? (
                            <div
                              key={i}
                              className={cn(
                                "rounded-lg border bg-accent/30 px-3.5 py-3 text-sm whitespace-pre-wrap",
                                callResult.result?.isError && "border-destructive/40 bg-destructive/5 text-destructive",
                              )}
                            >
                              {block.text}
                            </div>
                          ) : (
                            <pre
                              key={i}
                              className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap"
                            >
                              {JSON.stringify(block, null, 2)}
                            </pre>
                          ),
                        )
                      )}
                    </div>
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
