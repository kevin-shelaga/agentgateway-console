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

/**
 * Load a KubeConfig: in-cluster when running inside Kubernetes, otherwise
 * from the default kubeconfig. Optionally switch to a named context.
 */
export function getKubeConfig(context?: string): KubeConfig {
  const kc = new KubeConfig();
  if (process.env.KUBERNETES_SERVICE_HOST) {
    kc.loadFromCluster();
  } else {
    kc.loadFromDefault();
  }
  if (context) {
    const known = kc.getContexts().some((c) => c.name === context);
    if (!known) {
      throw new Error(`unknown context: ${context}`);
    }
    kc.setCurrentContext(context);
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

/** Available kubeconfig contexts and the current one. */
export function listContexts(): { contexts: string[]; current: string } {
  const kc = getKubeConfig();
  return {
    contexts: kc.getContexts().map((c) => c.name),
    current: kc.getCurrentContext(),
  };
}
