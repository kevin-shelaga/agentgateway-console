"use client";

import { Plus } from "lucide-react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { GatewayClassPicker, SecretPicker } from "@/components/forms/pickers";
import { FormSection, numberOrUndefined, RemoveRowButton } from "@/components/forms/shared";
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
import { deleteAtPath, getAtPath, setAtPath, type Path } from "@/lib/object-path";

const PROTOCOLS = ["HTTP", "HTTPS", "TLS", "TCP"];

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function rows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}))
    : [];
}

export function GatewayForm({ doc, onChange }: ResourceFormProps) {
  const namespace = str(doc?.metadata?.namespace);
  const listeners = rows(getAtPath(doc, ["spec", "listeners"]));
  const addresses = getAtPath(doc, ["spec", "addresses"]);

  function set(path: Path, value: unknown) {
    onChange(setAtPath(doc, path, value));
  }

  function setOrDelete(path: Path, value: unknown) {
    if (value === undefined || value === "") onChange(deleteAtPath(doc, path));
    else onChange(setAtPath(doc, path, value));
  }

  function addListener() {
    set(["spec", "listeners"], [...listeners, { name: "", port: 80, protocol: "HTTP" }]);
  }

  function setProtocol(i: number, protocol: string) {
    let next = setAtPath(doc, ["spec", "listeners", i, "protocol"], protocol);
    // tls config only applies to HTTPS/TLS listeners.
    if (protocol !== "HTTPS" && protocol !== "TLS") {
      next = deleteAtPath(next, ["spec", "listeners", i, "tls"]);
    }
    onChange(next);
  }

  return (
    <>
      <FormSection title="Gateway class" description="Which controller implements this Gateway.">
        <div className="space-y-1.5">
          <Label className="text-xs">gatewayClassName</Label>
          <GatewayClassPicker
            value={str(getAtPath(doc, ["spec", "gatewayClassName"]))}
            onChange={(v) => set(["spec", "gatewayClassName"], v)}
          />
        </div>
      </FormSection>

      <FormSection
        title="Listeners"
        description="Ports and protocols this Gateway accepts traffic on."
        actions={
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={addListener}>
            <Plus className="size-3.5" />
            Add listener
          </Button>
        }
      >
        {listeners.length === 0 && (
          <p className="text-xs text-muted-foreground">No listeners defined yet.</p>
        )}
        {listeners.map((l, i) => {
          const protocol = str(l.protocol) ?? "";
          const isTls = protocol === "HTTPS" || protocol === "TLS";
          const from = str(getAtPath(l, ["allowedRoutes", "namespaces", "from"]));
          return (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input
                      className="h-8 font-mono text-sm"
                      value={str(l.name) ?? ""}
                      placeholder="http"
                      onChange={(e) => set(["spec", "listeners", i, "name"], e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Port</Label>
                    <Input
                      type="number"
                      className="h-8 text-sm"
                      value={num(l.port) ?? ""}
                      placeholder="80"
                      onChange={(e) =>
                        setOrDelete(["spec", "listeners", i, "port"], numberOrUndefined(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Protocol</Label>
                    <Select value={protocol} onValueChange={(v) => setProtocol(i, v)}>
                      <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue placeholder="Select protocol" />
                      </SelectTrigger>
                      <SelectContent>
                        {protocol && !PROTOCOLS.includes(protocol) && (
                          <SelectItem value={protocol}>{protocol}</SelectItem>
                        )}
                        {PROTOCOLS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <RemoveRowButton
                  onClick={() => onChange(deleteAtPath(doc, ["spec", "listeners", i]))}
                  label={`Remove listener ${str(l.name) ?? i}`}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Hostname (optional)</Label>
                  <Input
                    className="h-8 font-mono text-sm"
                    value={str(l.hostname) ?? ""}
                    placeholder="*.example.com"
                    onChange={(e) => setOrDelete(["spec", "listeners", i, "hostname"], e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Allowed route namespaces</Label>
                  <Select
                    value={from ?? ""}
                    onValueChange={(v) =>
                      set(["spec", "listeners", i, "allowedRoutes", "namespaces", "from"], v)
                    }
                  >
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue placeholder="Same (default)" />
                    </SelectTrigger>
                    <SelectContent>
                      {from && !["Same", "All", "Selector"].includes(from) && (
                        <SelectItem value={from}>{from}</SelectItem>
                      )}
                      <SelectItem value="Same">Same</SelectItem>
                      <SelectItem value="All">All</SelectItem>
                      <SelectItem value="Selector">Selector</SelectItem>
                    </SelectContent>
                  </Select>
                  {from === "Selector" && (
                    <p className="text-xs text-muted-foreground">
                      Namespace selector is edited in YAML (allowedRoutes.namespaces.selector).
                    </p>
                  )}
                </div>
              </div>

              {isTls && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">TLS mode</Label>
                    <Select
                      value={str(getAtPath(l, ["tls", "mode"])) ?? ""}
                      onValueChange={(v) => set(["spec", "listeners", i, "tls", "mode"], v)}
                    >
                      <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue placeholder="Terminate (default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Terminate">Terminate</SelectItem>
                        <SelectItem value="Passthrough">Passthrough</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Certificate secret</Label>
                    <SecretPicker
                      namespace={namespace}
                      value={str(getAtPath(l, ["tls", "certificateRefs", 0, "name"]))}
                      onChange={(v) =>
                        set(["spec", "listeners", i, "tls", "certificateRefs", 0, "name"], v)
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </FormSection>

      {Array.isArray(addresses) && addresses.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          spec.addresses: {addresses.length} address{addresses.length === 1 ? "" : "es"} configured in
          YAML.
        </p>
      )}
    </>
  );
}
