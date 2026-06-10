import { NextRequest, NextResponse } from "next/server";
import { asKubernetesObject, getObjectClient } from "@/lib/k8s/client";
import { contextFrom, errorResponse, forbidden } from "@/lib/k8s/registry-server";
import { ALL_RESOURCES } from "@/lib/registry";
import { apiVersionOf, type K8sResource } from "@/lib/types";

interface DryRunRequest {
  manifest: K8sResource;
  mode: "create" | "update";
}

/**
 * Server-side dry-run: the apiserver runs full schema + CEL validation and
 * admission without persisting. This is the only validation layer that
 * executes x-kubernetes-validations rules.
 */
export async function POST(req: NextRequest) {
  let body: DryRunRequest;
  try {
    body = (await req.json()) as DryRunRequest;
  } catch {
    return forbidden("request body must be JSON: { manifest, mode }");
  }

  const { manifest, mode } = body;
  const desc = ALL_RESOURCES.find(
    (r) => !r.readOnly && r.kind === manifest?.kind && apiVersionOf(r) === manifest?.apiVersion,
  );
  if (!desc) {
    return forbidden(`dry-run not supported for ${manifest?.apiVersion}/${manifest?.kind}`);
  }

  try {
    const client = getObjectClient(contextFrom(req));
    if (mode === "update") {
      await client.replace(asKubernetesObject(manifest), undefined, "All");
    } else {
      await client.create(asKubernetesObject(manifest), undefined, "All");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
