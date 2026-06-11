import { NextRequest, NextResponse } from "next/server";
import { getApiextensionsClient } from "@/lib/k8s/client";
import { contextFrom, forbidden } from "@/lib/k8s/registry-server";
import { ALL_RESOURCES } from "@/lib/registry";
import { getBundledSchema } from "@/lib/schemas";

type Params = { params: Promise<{ crd: string }> };

/**
 * Serves the CRD's openAPIV3Schema, preferring the version actually installed
 * in the cluster so validation matches reality; falls back to schemas bundled
 * at build time.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { crd } = await params;
  if (!ALL_RESOURCES.some((r) => r.crdName && r.crdName === crd)) {
    return forbidden(`unknown CRD: ${crd}`);
  }

  try {
    const client = getApiextensionsClient(contextFrom(req));
    const obj = await client.readCustomResourceDefinition({ name: crd });
    const versions: Record<string, object> = {};
    for (const v of obj.spec?.versions ?? []) {
      if (v.served && v.schema?.openAPIV3Schema) {
        versions[v.name] = v.schema.openAPIV3Schema as object;
      }
    }
    if (Object.keys(versions).length > 0) {
      return NextResponse.json({
        name: crd,
        group: obj.spec.group,
        kind: obj.spec.names.kind,
        plural: obj.spec.names.plural,
        scope: obj.spec.scope,
        versions,
        source: "cluster",
      });
    }
  } catch {
    // fall through to bundled
  }

  const bundled = getBundledSchema(crd);
  if (bundled) return NextResponse.json({ ...bundled, source: "bundled" });
  return NextResponse.json(
    { error: { status: 404, reason: "NotFound", message: `no schema for ${crd}`, causes: [] } },
    { status: 404 },
  );
}
