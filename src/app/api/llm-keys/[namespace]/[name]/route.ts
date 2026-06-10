import { NextRequest, NextResponse } from "next/server";
import type { V1Secret } from "@kubernetes/client-node";
import { getCoreClient } from "@/lib/k8s/client";
import { contextFrom, errorResponse, forbidden } from "@/lib/k8s/registry-server";
import {
  AUTH_DATA_KEY,
  MANAGED_BY_LABEL,
  MANAGED_BY_VALUE,
  toLlmKeyMeta,
} from "../../route";

type Params = { params: Promise<{ namespace: string; name: string }> };

function isManaged(secret: V1Secret): boolean {
  return secret.metadata?.labels?.[MANAGED_BY_LABEL] === MANAGED_BY_VALUE;
}

/**
 * Rotate: replace the secret's data with a single fresh `Authorization`
 * entry, preserving identity (labels/annotations). The old and new key
 * values are never logged and never echoed back.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const { namespace, name } = await params;

  let apiKey: unknown;
  try {
    ({ apiKey } = (await req.json()) as { apiKey?: unknown });
  } catch {
    return forbidden("request body must be JSON");
  }
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return forbidden("apiKey is required");
  }

  try {
    const core = getCoreClient(contextFrom(req));
    const existing = await core.readNamespacedSecret({ name, namespace });
    if (!isManaged(existing) && existing.data?.[AUTH_DATA_KEY] === undefined) {
      return forbidden(
        `secret ${namespace}/${name} is not an LLM API key (no ${AUTH_DATA_KEY} entry and not managed by this console)`,
      );
    }

    const replacement: V1Secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name,
        namespace,
        labels: existing.metadata?.labels,
        annotations: existing.metadata?.annotations,
        resourceVersion: existing.metadata?.resourceVersion,
      },
      type: existing.type ?? "Opaque",
      stringData: { [AUTH_DATA_KEY]: apiKey },
    };
    const updated = await core.replaceNamespacedSecret({ name, namespace, body: replacement });
    return NextResponse.json(toLlmKeyMeta(updated));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Delete is reserved for secrets this console created (managed-by label). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { namespace, name } = await params;
  try {
    const core = getCoreClient(contextFrom(req));
    const existing = await core.readNamespacedSecret({ name, namespace });
    if (!isManaged(existing)) {
      return forbidden(`secret ${namespace}/${name} is not managed by this console`);
    }
    await core.deleteNamespacedSecret({ name, namespace });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
