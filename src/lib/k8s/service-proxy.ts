import type https from "node:https";
import { Agent } from "undici";
import { getKubeConfig } from "./client";

/**
 * `svc://namespace/service:port/path` — reach an in-cluster Service through
 * the Kubernetes API-server proxy. This is how the playground reaches
 * gateways that have no published address (kind, clusters without a
 * LoadBalancer provider): the BFF can always reach the API server.
 */
export interface SvcTarget {
  namespace: string;
  service: string;
  port: number;
  path: string;
}

export function parseSvcUrl(raw: string): SvcTarget | null {
  const m = /^svc:\/\/([a-z0-9-]+)\/([a-z0-9-]+):(\d{1,5})(\/.*)?$/.exec(raw);
  if (!m) return null;
  return { namespace: m[1], service: m[2], port: Number(m[3]), path: m[4] ?? "/" };
}

export interface ServiceProxyTarget {
  /** Absolute API-server URL: …/api/v1/namespaces/:ns/services/:svc::port/proxy/:path */
  url: string;
  /** Auth headers from the kubeconfig (bearer token etc.). */
  headers: Record<string, string>;
  /** undici dispatcher carrying the cluster CA / client certs. */
  dispatcher: Agent;
}

/** Resolve a svc:// target to an authenticated API-server proxy request. */
export async function serviceProxyTarget(
  context: string | undefined,
  target: SvcTarget,
  insecureTls = false,
): Promise<ServiceProxyTarget> {
  const kc = getKubeConfig(context);
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new Error("no current cluster in kubeconfig");

  const opts: https.RequestOptions = {};
  await kc.applyToHTTPSOptions(opts);

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.headers ?? {})) {
    if (typeof value === "string") headers[key] = value;
  }

  const url =
    `${cluster.server.replace(/\/+$/, "")}/api/v1/namespaces/${encodeURIComponent(target.namespace)}` +
    `/services/${encodeURIComponent(target.service)}:${target.port}/proxy${target.path}`;

  const dispatcher = new Agent({
    connect: {
      ca: opts.ca as Buffer | undefined,
      cert: opts.cert as Buffer | undefined,
      key: opts.key as Buffer | undefined,
      rejectUnauthorized: insecureTls ? false : opts.rejectUnauthorized !== false,
    },
  });

  return { url, headers, dispatcher };
}
