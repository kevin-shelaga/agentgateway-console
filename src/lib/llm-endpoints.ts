import { getReferences } from "./references";
import type { K8sResource } from "./types";

export interface LlmEndpoint {
  /** Base URL of the gateway listener, e.g. "https://4.229.185.215". */
  url: string;
  /** Route hostname the gateway matches on (sent as Host header), if any. */
  hostname?: string;
  /** First path prefix the route matches. */
  pathPrefix: string;
  gateway: string;
  route: string;
}

function nsName(res: K8sResource): string {
  return `${res.metadata.namespace ?? ""}/${res.metadata.name}`;
}

/**
 * Where is this AI backend reachable? Walk routes that reference it to their
 * parent gateways, then combine gateway addresses with HTTP(S) listeners.
 */
export function resolveLlmEndpoints(
  backend: K8sResource,
  routes: K8sResource[],
  gateways: K8sResource[],
): LlmEndpoint[] {
  const endpoints: LlmEndpoint[] = [];

  for (const route of routes) {
    const refs = getReferences(route);
    const referencesBackend = refs.some(
      (r) =>
        r.kind === backend.kind &&
        r.name === backend.metadata.name &&
        (r.namespace ?? backend.metadata.namespace) === backend.metadata.namespace,
    );
    if (!referencesBackend) continue;

    const spec = (route.spec ?? {}) as Record<string, unknown>;
    const hostname = Array.isArray(spec.hostnames)
      ? (spec.hostnames[0] as string | undefined)
      : undefined;
    const rules = Array.isArray(spec.rules) ? (spec.rules as Array<Record<string, unknown>>) : [];
    const firstMatch = (rules[0]?.matches as Array<Record<string, unknown>> | undefined)?.[0];
    const path = (firstMatch?.path as Record<string, unknown> | undefined)?.value;
    const pathPrefix = typeof path === "string" ? path : "/";

    for (const parent of refs.filter((r) => r.kind === "Gateway")) {
      const gw = gateways.find(
        (g) =>
          g.metadata.name === parent.name &&
          (parent.namespace === undefined || g.metadata.namespace === parent.namespace),
      );
      if (!gw) continue;

      const status = (gw.status ?? {}) as Record<string, unknown>;
      const addresses = Array.isArray(status.addresses)
        ? (status.addresses as Array<Record<string, unknown>>)
        : [];
      const address = addresses.find((a) => typeof a.value === "string")?.value as
        | string
        | undefined;
      if (!address) continue;

      const listeners = Array.isArray(gw.spec?.listeners)
        ? (gw.spec!.listeners as Array<Record<string, unknown>>)
        : [];
      for (const listener of listeners) {
        const protocol = listener.protocol;
        if (protocol !== "HTTP" && protocol !== "HTTPS") continue;
        const scheme = protocol === "HTTPS" ? "https" : "http";
        const port = typeof listener.port === "number" ? listener.port : undefined;
        const defaultPort = scheme === "https" ? 443 : 80;
        const url =
          port === undefined || port === defaultPort
            ? `${scheme}://${address}`
            : `${scheme}://${address}:${port}`;
        endpoints.push({ url, hostname, pathPrefix, gateway: nsName(gw), route: nsName(route) });
      }
    }
  }

  return endpoints;
}

/** Model preconfigured on the backend's AI provider, if any. */
export function defaultModel(backend: K8sResource): string {
  const ai = (backend.spec as Record<string, unknown> | undefined)?.ai as
    | Record<string, unknown>
    | undefined;
  const provider = (ai?.provider ?? {}) as Record<string, unknown>;
  for (const config of Object.values(provider)) {
    const model = (config as Record<string, unknown> | null)?.model;
    if (typeof model === "string") return model;
  }
  return "";
}

/** Sensible chat-completions URL for an endpoint (always user-editable). */
export function suggestUrl(endpoint: LlmEndpoint): string {
  const prefix = endpoint.pathPrefix.replace(/\/$/, "");
  return `${endpoint.url}${prefix}/v1/chat/completions`;
}

/**
 * Sensible MCP URL for an endpoint (always user-editable). agentgateway
 * serves MCP at the route path; /mcp is the common default suffix.
 */
export function suggestMcpUrl(endpoint: LlmEndpoint): string {
  const prefix = endpoint.pathPrefix.replace(/\/$/, "");
  return `${endpoint.url}${prefix}/mcp`;
}
