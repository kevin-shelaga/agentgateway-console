import { NextRequest, NextResponse } from "next/server";
import { asKubernetesObject, getObjectClient } from "@/lib/k8s/client";
import {
  alignManifestVersion,
  CLUSTER_SEGMENT,
  contextFrom,
  errorResponse,
  forbidden,
  resolveApiVersion,
  resolveDescriptor,
  stripSecretData,
} from "@/lib/k8s/registry-server";
import { apiVersionOf, type K8sResource, type ResourceDescriptor } from "@/lib/types";

type Params = {
  params: Promise<{
    group: string;
    version: string;
    plural: string;
    namespace: string;
    name: string;
  }>;
};

function refOf(desc: ResourceDescriptor, apiVersion: string, namespace: string, name: string) {
  return {
    apiVersion,
    kind: desc.kind,
    metadata: {
      name,
      ...(namespace !== CLUSTER_SEGMENT ? { namespace } : {}),
    },
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { group, version, plural, namespace, name } = await params;
  const desc = resolveDescriptor(group, version, plural);
  if (!desc) return forbidden(`unsupported resource: ${group}/${version}/${plural}`);

  try {
    const context = contextFrom(req);
    const client = getObjectClient(context);
    const obj = await client.read(refOf(desc, await resolveApiVersion(desc, context), namespace, name));
    return NextResponse.json(stripSecretData(obj as K8sResource));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { group, version, plural, namespace, name } = await params;
  const desc = resolveDescriptor(group, version, plural);
  if (!desc) return forbidden(`unsupported resource: ${group}/${version}/${plural}`);
  if (desc.readOnly) return forbidden(`${desc.kind} is read-only in this console`);

  try {
    const manifest = (await req.json()) as K8sResource;
    if (manifest.metadata?.name !== name) {
      return forbidden(`manifest name "${manifest.metadata?.name}" does not match URL "${name}"`);
    }
    const context = contextFrom(req);
    const client = getObjectClient(context);
    const aligned = alignManifestVersion(manifest, desc, await resolveApiVersion(desc, context));
    const updated = await client.replace(asKubernetesObject(aligned));
    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { group, version, plural, namespace, name } = await params;
  const desc = resolveDescriptor(group, version, plural);
  if (!desc) return forbidden(`unsupported resource: ${group}/${version}/${plural}`);
  if (desc.readOnly) return forbidden(`${desc.kind} is read-only in this console`);

  try {
    const context = contextFrom(req);
    const client = getObjectClient(context);
    const status = await client.delete(refOf(desc, await resolveApiVersion(desc, context), namespace, name));
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
