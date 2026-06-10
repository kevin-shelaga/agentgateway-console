import { parse, stringify } from "yaml";
import type { K8sResource } from "./types";

/** kubectl-style display: hide server bookkeeping the user never edits. */
export function toDisplayYaml(res: K8sResource): string {
  const clone = JSON.parse(JSON.stringify(res)) as K8sResource;
  const metadata = clone.metadata as unknown as Record<string, unknown>;
  delete metadata.managedFields;
  const annotations = metadata.annotations as Record<string, string> | undefined;
  if (annotations) {
    delete annotations["kubectl.kubernetes.io/last-applied-configuration"];
    if (Object.keys(annotations).length === 0) delete metadata.annotations;
  }
  return stringify(clone, { indent: 2, lineWidth: 120 });
}

/**
 * Editing surface: strip status and server-managed metadata, keep identity
 * fields the apiserver needs on update (resourceVersion).
 */
export function toEditableYaml(res: K8sResource): string {
  const clone = JSON.parse(JSON.stringify(res)) as K8sResource;
  delete clone.status;
  const metadata = clone.metadata as unknown as Record<string, unknown>;
  for (const key of ["managedFields", "uid", "generation", "creationTimestamp"]) {
    delete metadata[key];
  }
  const annotations = metadata.annotations as Record<string, string> | undefined;
  if (annotations) {
    delete annotations["kubectl.kubernetes.io/last-applied-configuration"];
    if (Object.keys(annotations).length === 0) delete metadata.annotations;
  }
  return stringify(clone, { indent: 2, lineWidth: 120 });
}

export function parseYamlResource(text: string): K8sResource {
  return parse(text) as K8sResource;
}
