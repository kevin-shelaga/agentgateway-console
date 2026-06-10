import { NextRequest, NextResponse } from "next/server";
import { asKubernetesObject, getObjectClient } from "@/lib/k8s/client";
import {
  contextFrom,
  errorResponse,
  forbidden,
  resolveDescriptor,
  stripSecretData,
} from "@/lib/k8s/registry-server";
import { apiVersionOf, type K8sResource } from "@/lib/types";

type Params = { params: Promise<{ group: string; version: string; plural: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { group, version, plural } = await params;
  const desc = resolveDescriptor(group, version, plural);
  if (!desc) return forbidden(`unsupported resource: ${group}/${version}/${plural}`);

  const namespace = req.nextUrl.searchParams.get("namespace") ?? undefined;
  try {
    const client = getObjectClient(contextFrom(req));
    const list = await client.list(
      apiVersionOf(desc),
      desc.kind,
      desc.scope === "Namespaced" ? namespace : undefined,
    );
    const items = (list.items as K8sResource[]).map(stripSecretData);
    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { group, version, plural } = await params;
  const desc = resolveDescriptor(group, version, plural);
  if (!desc) return forbidden(`unsupported resource: ${group}/${version}/${plural}`);
  if (desc.readOnly) return forbidden(`${desc.kind} is read-only in this console`);

  try {
    const manifest = (await req.json()) as K8sResource;
    if (manifest.kind !== desc.kind || manifest.apiVersion !== apiVersionOf(desc)) {
      return forbidden(
        `manifest is ${manifest.apiVersion}/${manifest.kind}, expected ${apiVersionOf(desc)}/${desc.kind}`,
      );
    }
    const client = getObjectClient(contextFrom(req));
    const created = await client.create(asKubernetesObject(manifest));
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
