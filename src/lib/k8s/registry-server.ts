import { NextResponse } from "next/server";
import { ALL_RESOURCES } from "../registry";
import type { K8sResource, ResourceDescriptor } from "../types";
import { parseK8sError } from "./errors";

export { CLUSTER_SEGMENT, CORE_GROUP_SEGMENT } from "../api-client";
import { CORE_GROUP_SEGMENT } from "../api-client";

/**
 * Resolves a URL triple to a managed descriptor. Anything outside the
 * allowlist is rejected — this server only ever touches known kinds.
 */
export function resolveDescriptor(
  group: string,
  version: string,
  plural: string,
): ResourceDescriptor | undefined {
  const effectiveGroup = group === CORE_GROUP_SEGMENT ? "" : group;
  return ALL_RESOURCES.find(
    (r) => r.group === effectiveGroup && r.version === version && r.plural === plural,
  );
}

import { getApiextensionsClient } from "./client";
import { apiVersionOf } from "../types";

const SERVED_VERSION_TTL_MS = 5 * 60_000;
const servedVersionCache = new Map<string, { apiVersion: string; at: number }>();

/**
 * The apiVersion the connected cluster actually serves for this kind.
 * Gateway API CRDs skew across releases (e.g. TLSRoute v1 vs v1alpha3), so
 * prefer the registry version, fall back to the descriptor's known older
 * versions, then to whatever the CRD serves. Cached per context+CRD.
 */
export async function resolveApiVersion(
  desc: ResourceDescriptor,
  context: string | undefined,
): Promise<string> {
  if (!desc.crdName) return apiVersionOf(desc);
  const cacheKey = `${context ?? ""}|${desc.crdName}`;
  const cached = servedVersionCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SERVED_VERSION_TTL_MS) return cached.apiVersion;

  let resolved = apiVersionOf(desc);
  try {
    const crd = await getApiextensionsClient(context).readCustomResourceDefinition({
      name: desc.crdName,
    });
    const served = (crd.spec?.versions ?? []).filter((v) => v.served).map((v) => v.name);
    const pick =
      (served.includes(desc.version) ? desc.version : undefined) ??
      (desc.versionFallbacks ?? []).find((v) => served.includes(v)) ??
      served[0];
    if (pick) resolved = `${desc.group}/${pick}`;
  } catch {
    // CRD unreadable (missing, RBAC) — keep the registry default; the
    // resource call itself will surface the real error.
  }
  servedVersionCache.set(cacheKey, { apiVersion: resolved, at: Date.now() });
  return resolved;
}

/** Align a manifest's apiVersion with what the cluster serves (same group only). */
export function alignManifestVersion<T extends { apiVersion: string }>(
  manifest: T,
  desc: ResourceDescriptor,
  servedApiVersion: string,
): T {
  if (manifest.apiVersion === servedApiVersion) return manifest;
  const sameGroup = manifest.apiVersion.split("/")[0] === desc.group;
  return sameGroup ? { ...manifest, apiVersion: servedApiVersion } : manifest;
}

/** Secrets are listable for pickers, but their payload never leaves the server. */
export function stripSecretData(res: K8sResource): K8sResource {
  if (res.kind !== "Secret") return res;
  const { data: _data, stringData: _stringData, ...rest } = res;
  return rest as K8sResource;
}

export function contextFrom(req: Request): string | undefined {
  return req.headers.get("x-kube-context") ?? undefined;
}

export function errorResponse(err: unknown): NextResponse {
  const parsed = parseK8sError(err);
  const status = parsed.status >= 400 && parsed.status < 600 ? parsed.status : 500;
  return NextResponse.json({ error: parsed }, { status });
}

export function forbidden(message: string): NextResponse {
  return NextResponse.json(
    { error: { status: 403, reason: "Forbidden", message, causes: [] } },
    { status: 403 },
  );
}
