"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, useContext, useEffect } from "react";
import { recordSamples } from "./metrics-history";
import {
  createResource,
  deleteResource,
  dryRunResource,
  fetchClusterInfo,
  fetchContexts,
  fetchInfra,
  fetchSchema,
  getResourceItem,
  listResources,
} from "./api-client";
import { ApiError, updateResource } from "./api-client";
import { READONLY_RESOURCES } from "./registry";
import type { K8sResource, ResourceDescriptor } from "./types";

/** Current kubeconfig context; part of every query key so switching refetches. */
export const KubeContext = createContext<{
  context: string | null;
  setContext: (c: string | null) => void;
}>({ context: null, setContext: () => {} });

export function useKubeContext() {
  return useContext(KubeContext);
}

const namespacesDesc = READONLY_RESOURCES.find((r) => r.id === "namespaces")!;

export function useResourceList(desc: ResourceDescriptor, namespace?: string) {
  const { context } = useKubeContext();
  return useQuery({
    queryKey: ["list", context, desc.id, namespace ?? ""],
    queryFn: () => listResources(desc, namespace),
  });
}

/**
 * Like useResourceList, but a missing CRD (404) yields an empty list instead
 * of an error — for kinds that may not be installed (enterprise, ListenerSet).
 */
export function useResourceListOptional(desc: ResourceDescriptor, namespace?: string) {
  const { context } = useKubeContext();
  return useQuery({
    queryKey: ["list-optional", context, desc.id, namespace ?? ""],
    queryFn: async () => {
      try {
        return await listResources(desc, namespace);
      } catch (err) {
        if (err instanceof ApiError && err.parsed.status === 404) return [];
        throw err;
      }
    },
  });
}

export function useResource(
  desc: ResourceDescriptor,
  namespace: string | undefined,
  name: string,
) {
  const { context } = useKubeContext();
  return useQuery({
    queryKey: ["item", context, desc.id, namespace ?? "", name],
    queryFn: () => getResourceItem(desc, namespace, name),
  });
}

export function useNamespaces() {
  const { context } = useKubeContext();
  return useQuery({
    queryKey: ["list", context, "namespaces", ""],
    queryFn: () => listResources(namespacesDesc),
    staleTime: 60_000,
  });
}

export function useInfra() {
  const { context } = useKubeContext();
  const query = useQuery({
    queryKey: ["infra", context],
    queryFn: fetchInfra,
    refetchInterval: 15_000,
  });
  // Every consumer feeds the session-wide usage history (charts/sparklines).
  useEffect(() => {
    if (query.data?.metricsAvailable) recordSamples(query.data.pods, Date.now());
  }, [query.data]);
  return query;
}

export function useClusterInfo() {
  const { context } = useKubeContext();
  return useQuery({
    queryKey: ["cluster", context],
    queryFn: fetchClusterInfo,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useContexts() {
  return useQuery({ queryKey: ["contexts"], queryFn: fetchContexts, staleTime: 300_000 });
}

export function useSchema(crdName: string) {
  const { context } = useKubeContext();
  return useQuery({
    queryKey: ["schema", context, crdName],
    queryFn: () => fetchSchema(crdName),
    staleTime: 300_000,
    enabled: !!crdName,
  });
}

export interface SaveArgs {
  manifest: K8sResource;
  mode: "create" | "update";
}

/** Save pipeline: server-side dry-run first, apply only when it passes. */
export function useSaveResource(desc: ResourceDescriptor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ manifest, mode }: SaveArgs) => {
      await dryRunResource(manifest, mode);
      return mode === "create"
        ? createResource(desc, manifest)
        : updateResource(desc, manifest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list"] });
      queryClient.invalidateQueries({ queryKey: ["item"] });
    },
  });
}

export function useDryRun() {
  return useMutation({
    mutationFn: ({ manifest, mode }: SaveArgs) => dryRunResource(manifest, mode),
  });
}

export function useDeleteResource(desc: ResourceDescriptor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespace, name }: { namespace?: string; name: string }) =>
      deleteResource(desc, namespace, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list"] });
    },
  });
}
