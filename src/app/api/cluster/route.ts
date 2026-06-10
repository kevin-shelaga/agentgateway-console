import { NextRequest, NextResponse } from "next/server";
import { getCoreClient, getKubeConfig } from "@/lib/k8s/client";
import { contextFrom } from "@/lib/k8s/registry-server";
import { parseK8sError } from "@/lib/k8s/errors";

/** Lightweight connectivity probe powering the cluster status indicator. */
export async function GET(req: NextRequest) {
  const context = contextFrom(req);
  try {
    const kc = getKubeConfig(context);
    const core = getCoreClient(context);
    await core.listNamespace({ limit: 1 });
    return NextResponse.json({ connected: true, context: kc.getCurrentContext() });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      context: context ?? null,
      error: parseK8sError(err).message,
    });
  }
}
