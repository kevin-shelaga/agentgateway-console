import { NextResponse } from "next/server";
import { ALL_RESOURCES } from "../registry";
import type { K8sResource, ResourceDescriptor } from "../types";
import { parseK8sError } from "./errors";

/** URL segment used for the core API group (empty group can't be a path segment). */
export const CORE_GROUP_SEGMENT = "core";
/** URL segment used in place of a namespace for cluster-scoped resources. */
export const CLUSTER_SEGMENT = "_cluster";

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
