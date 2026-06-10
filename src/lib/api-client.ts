import type { ParsedK8sError } from "./k8s/errors";
import type { K8sResource, ResourceDescriptor } from "./types";

/** URL segment for the core API group (empty group can't be a path segment). */
export const CORE_GROUP_SEGMENT = "core";
/** URL segment standing in for a namespace on cluster-scoped resources. */
export const CLUSTER_SEGMENT = "_cluster";

const CONTEXT_STORAGE_KEY = "agc.context";

export function getStoredContext(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CONTEXT_STORAGE_KEY);
}

export function setStoredContext(context: string | null) {
  if (typeof window === "undefined") return;
  if (context) window.localStorage.setItem(CONTEXT_STORAGE_KEY, context);
  else window.localStorage.removeItem(CONTEXT_STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(public parsed: ParsedK8sError) {
    super(parsed.message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const context = getStoredContext();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(context ? { "x-kube-context": context } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed: ParsedK8sError = body?.error ?? {
      status: res.status,
      reason: res.statusText || "Error",
      message: `request failed with status ${res.status}`,
      causes: [],
    };
    throw new ApiError(parsed);
  }
  return body as T;
}

function basePath(desc: Pick<ResourceDescriptor, "group" | "version" | "plural">): string {
  const group = desc.group || CORE_GROUP_SEGMENT;
  return `/api/resources/${group}/${desc.version}/${desc.plural}`;
}

function itemPath(desc: ResourceDescriptor, namespace: string | undefined, name: string): string {
  const ns = desc.scope === "Cluster" ? CLUSTER_SEGMENT : namespace;
  if (!ns) throw new Error(`namespace required for ${desc.kind}/${name}`);
  return `${basePath(desc)}/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`;
}

export async function listResources(
  desc: ResourceDescriptor,
  namespace?: string,
): Promise<K8sResource[]> {
  const qs = namespace && desc.scope === "Namespaced" ? `?namespace=${encodeURIComponent(namespace)}` : "";
  const body = await request<{ items: K8sResource[] }>(`${basePath(desc)}${qs}`);
  return body.items;
}

export async function getResourceItem(
  desc: ResourceDescriptor,
  namespace: string | undefined,
  name: string,
): Promise<K8sResource> {
  return request<K8sResource>(itemPath(desc, namespace, name));
}

export async function createResource(
  desc: ResourceDescriptor,
  manifest: K8sResource,
): Promise<K8sResource> {
  return request<K8sResource>(basePath(desc), { method: "POST", body: JSON.stringify(manifest) });
}

export async function updateResource(
  desc: ResourceDescriptor,
  manifest: K8sResource,
): Promise<K8sResource> {
  return request<K8sResource>(
    itemPath(desc, manifest.metadata.namespace, manifest.metadata.name),
    { method: "PUT", body: JSON.stringify(manifest) },
  );
}

export async function deleteResource(
  desc: ResourceDescriptor,
  namespace: string | undefined,
  name: string,
): Promise<void> {
  await request(itemPath(desc, namespace, name), { method: "DELETE" });
}

export async function dryRunResource(
  manifest: K8sResource,
  mode: "create" | "update",
): Promise<void> {
  await request("/api/dry-run", { method: "POST", body: JSON.stringify({ manifest, mode }) });
}

export interface CrdSchemaResponse {
  name: string;
  group: string;
  kind: string;
  plural: string;
  scope: string;
  versions: Record<string, object>;
  source: "cluster" | "bundled";
}

export async function fetchSchema(crdName: string): Promise<CrdSchemaResponse> {
  return request<CrdSchemaResponse>(`/api/schemas/${encodeURIComponent(crdName)}`);
}

export interface ContextsResponse {
  contexts: string[];
  current: string;
  /** True when the console is hard-locked to the surrounding cluster. */
  inCluster: boolean;
}

export async function fetchContexts(): Promise<ContextsResponse> {
  return request<ContextsResponse>("/api/contexts");
}

export interface InfraPod {
  name: string;
  namespace: string;
  role: "proxy" | "controlplane";
  gateway?: string;
  phase: string;
  ready: string;
  restarts: number;
  node?: string;
  startTime?: string;
  cpuMillis?: number;
  memoryBytes?: number;
  cpuRequestMillis?: number;
  memoryRequestBytes?: number;
  cpuLimitMillis?: number;
  memoryLimitBytes?: number;
}

export interface InfraResponse {
  metricsAvailable: boolean;
  pods: InfraPod[];
}

export async function fetchInfra(): Promise<InfraResponse> {
  return request<InfraResponse>("/api/infra");
}

export interface LlmTestPayload {
  url: string;
  hostname?: string;
  authHeader?: { name: string; value: string };
  body: unknown;
  insecureTls?: boolean;
}

export interface LlmTestResult {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  contentType?: string | null;
  body: unknown;
}

export async function testLlm(payload: LlmTestPayload): Promise<LlmTestResult> {
  return request<LlmTestResult>("/api/llm-test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ClusterInfo {
  connected: boolean;
  context: string | null;
  error?: string;
}

export async function fetchClusterInfo(): Promise<ClusterInfo> {
  return request<ClusterInfo>("/api/cluster");
}
