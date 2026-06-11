export interface K8sCondition {
  type: string;
  status: "True" | "False" | "Unknown";
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
  observedGeneration?: number;
}

/** A condition annotated with where it came from (e.g. `listener/http`, `parent/gw`). */
export interface ScopedCondition extends K8sCondition {
  scope?: string;
}

export interface K8sMetadata {
  name: string;
  namespace?: string;
  uid?: string;
  creationTimestamp?: string;
  resourceVersion?: string;
  generation?: number;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: K8sMetadata;
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface K8sResourceList {
  items: K8sResource[];
}

export type HealthState = "Healthy" | "Degraded" | "Pending" | "Unknown";

export interface StatusSummary {
  state: HealthState;
  message: string;
  conditions: ScopedCondition[];
}

export interface ColumnDef {
  id: string;
  header: string;
  /** Returns display text; arrays render as stacked badges. */
  accessor: (res: K8sResource) => string | string[] | undefined;
  mono?: boolean;
}

export interface ResourceDescriptor {
  /** URL segment and registry key, e.g. "backends". */
  id: string;
  kind: string;
  group: string;
  version: string;
  plural: string;
  scope: "Namespaced" | "Cluster";
  /** CRD metadata.name, used to fetch the validation schema. */
  crdName: string;
  /**
   * Older API versions to use when the cluster's CRD doesn't serve
   * `version` (Gateway API channel/version skew, e.g. TLSRoute v1alpha3).
   */
  versionFallbacks?: string[];
  label: string;
  labelPlural: string;
  description: string;
  /** Key into the client-side icon map (keeps this module server-safe). */
  icon: string;
  listColumns: ColumnDef[];
  getStatus: (res: K8sResource) => StatusSummary;
  template: (namespace: string) => K8sResource;
  docsUrl?: string;
  readOnly?: boolean;
}

export function apiVersionOf(d: Pick<ResourceDescriptor, "group" | "version">): string {
  return d.group ? `${d.group}/${d.version}` : d.version;
}
