import {
  ApiextensionsV1Api,
  CoreV1Api,
  KubeConfig,
  KubernetesObjectApi,
  type KubernetesObject,
} from "@kubernetes/client-node";

/**
 * Bridges our wire-format typing (string timestamps) to the client's
 * KubernetesObject (Date timestamps). Safe: the client serializes back to the
 * same JSON either way.
 */
export function asKubernetesObject(res: unknown): KubernetesObject {
  return res as KubernetesObject;
}

/** In-cluster deployments are hard-locked to their own cluster. */
export function isInCluster(): boolean {
  return !!process.env.KUBERNETES_SERVICE_HOST || process.env.AGC_IN_CLUSTER === "true";
}

/**
 * Decide which kubeconfig context to use. In-cluster the request's context is
 * ignored entirely (single-cluster isolation); locally an explicit request
 * wins, then the CLI's --context (AGC_CONTEXT), then the kubeconfig default.
 */
export function resolveContext(
  requested: string | undefined,
  env: { inCluster: boolean; defaultContext?: string },
): string | undefined {
  if (env.inCluster) return undefined;
  return requested ?? env.defaultContext ?? undefined;
}

/**
 * Load a KubeConfig: in-cluster when running inside Kubernetes, otherwise
 * from the default kubeconfig. Optionally switch to a named context.
 */
export function getKubeConfig(context?: string): KubeConfig {
  const kc = new KubeConfig();
  if (isInCluster()) {
    kc.loadFromCluster();
    return kc;
  }
  kc.loadFromDefault();
  const effective = resolveContext(context, {
    inCluster: false,
    defaultContext: process.env.AGC_CONTEXT,
  });
  if (effective) {
    const known = kc.getContexts().some((c) => c.name === effective);
    if (!known) {
      throw new Error(`unknown context: ${effective}`);
    }
    kc.setCurrentContext(effective);
  }
  return kc;
}

/** Dynamic client for any resource (used for CRUD on managed GVKs). */
export function getObjectClient(context?: string): KubernetesObjectApi {
  return KubernetesObjectApi.makeApiClient(getKubeConfig(context));
}

/** Core v1 client (namespaces, services, secrets — read-only usage). */
export function getCoreClient(context?: string): CoreV1Api {
  return getKubeConfig(context).makeApiClient(CoreV1Api);
}

/** Apiextensions client (reading CRDs for live schemas). */
export function getApiextensionsClient(context?: string): ApiextensionsV1Api {
  return getKubeConfig(context).makeApiClient(ApiextensionsV1Api);
}

export interface ContextsInfo {
  contexts: string[];
  current: string;
  /** True when hard-locked to the surrounding cluster (no switching). */
  inCluster: boolean;
}

/** Available kubeconfig contexts and the current one. */
export function listContexts(): ContextsInfo {
  if (isInCluster()) {
    return { contexts: [], current: "in-cluster", inCluster: true };
  }
  const kc = getKubeConfig();
  return {
    contexts: kc.getContexts().map((c) => c.name),
    current: kc.getCurrentContext(),
    inCluster: false,
  };
}
