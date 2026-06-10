import { NextRequest, NextResponse } from "next/server";
import type { V1Secret } from "@kubernetes/client-node";
import { getCoreClient } from "@/lib/k8s/client";
import { contextFrom, errorResponse, forbidden } from "@/lib/k8s/registry-server";

export const MANAGED_BY_LABEL = "agentgateway.dev/managed-by";
export const MANAGED_BY_VALUE = "console";
export const PROVIDER_LABEL = "agentgateway.dev/provider";
/** Secret data key agentgateway reads the provider credential from. */
export const AUTH_DATA_KEY = "Authorization";

/** Metadata-only projection — secret payloads never leave the server. */
export interface LlmKeyMeta {
  name: string;
  namespace: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  managed: boolean;
}

export function toLlmKeyMeta(secret: V1Secret): LlmKeyMeta {
  return {
    name: secret.metadata?.name ?? "?",
    namespace: secret.metadata?.namespace ?? "?",
    creationTimestamp: secret.metadata?.creationTimestamp
      ? new Date(secret.metadata.creationTimestamp).toISOString()
      : undefined,
    labels: secret.metadata?.labels,
    managed: secret.metadata?.labels?.[MANAGED_BY_LABEL] === MANAGED_BY_VALUE,
  };
}

export function isLlmKeySecret(secret: V1Secret): boolean {
  if ((secret.type ?? "Opaque") !== "Opaque") return false;
  if (secret.data?.[AUTH_DATA_KEY] !== undefined) return true;
  return secret.metadata?.labels?.[MANAGED_BY_LABEL] === MANAGED_BY_VALUE;
}

/**
 * LLM API key inventory: Opaque secrets carrying an `Authorization` entry
 * (what AgentgatewayBackend `spec.policies.auth.secretRef` consumes) or the
 * console's managed-by label. Values are stripped server-side — only
 * metadata ever crosses the wire.
 */
export async function GET(req: NextRequest) {
  try {
    const core = getCoreClient(contextFrom(req));
    const namespace = req.nextUrl.searchParams.get("namespace") ?? undefined;
    const list = namespace
      ? await core.listNamespacedSecret({ namespace })
      : await core.listSecretForAllNamespaces();
    const items = list.items.filter(isLlmKeySecret).map(toLlmKeyMeta);
    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

interface CreateBody {
  name?: unknown;
  namespace?: unknown;
  apiKey?: unknown;
  providerHint?: unknown;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Create an Opaque secret holding the key; the key itself is never logged or echoed. */
export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return forbidden("request body must be JSON");
  }
  const { name, namespace, apiKey, providerHint } = body;
  if (!nonEmptyString(name)) return forbidden("name is required");
  if (!nonEmptyString(namespace)) return forbidden("namespace is required");
  if (!nonEmptyString(apiKey)) return forbidden("apiKey is required");

  const secret: V1Secret = {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name,
      namespace,
      labels: {
        [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
        ...(nonEmptyString(providerHint) ? { [PROVIDER_LABEL]: providerHint } : {}),
      },
    },
    type: "Opaque",
    stringData: { [AUTH_DATA_KEY]: apiKey },
  };

  try {
    const core = getCoreClient(contextFrom(req));
    const created = await core.createNamespacedSecret({ namespace, body: secret });
    return NextResponse.json(toLlmKeyMeta(created), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
