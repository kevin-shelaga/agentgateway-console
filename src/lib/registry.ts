import { summarizeStatus } from "./conditions";
import type { K8sResource, ResourceDescriptor, StatusSummary } from "./types";

const GATEWAY_API_GROUP = "gateway.networking.k8s.io";
const AGENTGATEWAY_GROUP = "agentgateway.dev";

function spec(res: K8sResource): Record<string, unknown> {
  return (res.spec ?? {}) as Record<string, unknown>;
}

function noStatus(res: K8sResource): StatusSummary {
  return { state: "Unknown", message: "", conditions: [] };
}

/** Which top-level key of an (Enterprise)AgentgatewayBackend spec is set. */
export function backendType(res: K8sResource): string {
  const s = spec(res);
  for (const key of ["ai", "mcp", "entMcp", "static", "dynamicForwardProxy", "aws", "a2a"]) {
    if (s[key] !== undefined) return key;
  }
  return "unknown";
}

export function backendDetail(res: K8sResource): string {
  const s = spec(res);
  const ai = s.ai as Record<string, unknown> | undefined;
  if (ai) {
    const provider = (ai.provider ?? {}) as Record<string, unknown>;
    const name = Object.keys(provider).find((k) =>
      ["openai", "azureopenai", "azure", "anthropic", "gemini", "vertexai", "bedrock", "custom"].includes(k),
    );
    if (name) {
      const model = (provider[name] as Record<string, unknown> | undefined)?.model;
      return model ? `${name} · ${model}` : name;
    }
    if (Array.isArray(ai.groups)) return `${ai.groups.length} priority group(s)`;
    return "ai";
  }
  const mcp = s.mcp as Record<string, unknown> | undefined;
  if (mcp && Array.isArray(mcp.targets)) return `${mcp.targets.length} target(s)`;
  const entMcp = s.entMcp as Record<string, unknown> | undefined;
  if (entMcp) {
    const count = Array.isArray(entMcp.targets) ? entMcp.targets.length : 0;
    const mode = typeof entMcp.toolMode === "string" ? ` · ${entMcp.toolMode}` : "";
    return `${count} target(s)${mode}`;
  }
  const stat = s.static as Record<string, unknown> | undefined;
  if (stat) return [stat.host, stat.port].filter((v) => v !== undefined).join(":");
  const a2a = s.a2a as Record<string, unknown> | undefined;
  if (a2a) return [a2a.host, a2a.port].filter((v) => v !== undefined).join(":");
  if (s.aws) return "agentCore";
  return "";
}

function policySections(res: K8sResource): string[] {
  return ["frontend", "traffic", "backend"].filter((k) => spec(res)[k] !== undefined);
}

function policyTargets(res: K8sResource): string[] {
  const targetRefs = spec(res).targetRefs;
  if (!Array.isArray(targetRefs)) return [];
  return targetRefs.map((ref) => {
    const r = ref as Record<string, unknown>;
    return [r.kind, r.name].filter(Boolean).join("/");
  });
}

export const RESOURCES: ResourceDescriptor[] = [
  {
    id: "gatewayclasses",
    kind: "GatewayClass",
    group: GATEWAY_API_GROUP,
    version: "v1",
    plural: "gatewayclasses",
    scope: "Cluster",
    crdName: "gatewayclasses.gateway.networking.k8s.io",
    label: "Gateway Class",
    labelPlural: "Gateway Classes",
    description: "Cluster-wide gateway implementations and their parameters",
    icon: "layers",
    listColumns: [
      {
        id: "controller",
        header: "Controller",
        mono: true,
        accessor: (r) => spec(r).controllerName as string | undefined,
      },
      {
        id: "paramsRef",
        header: "Parameters",
        mono: true,
        accessor: (r) => {
          const p = spec(r).parametersRef as Record<string, unknown> | undefined;
          return p ? `${p.kind}/${p.name}` : undefined;
        },
      },
    ],
    getStatus: summarizeStatus,
    template: () => ({
      apiVersion: `${GATEWAY_API_GROUP}/v1`,
      kind: "GatewayClass",
      metadata: { name: "agentgateway" },
      spec: { controllerName: "agentgateway.dev/agentgateway" },
    }),
    docsUrl: "https://gateway-api.sigs.k8s.io/api-types/gatewayclass/",
  },
  {
    id: "gateways",
    kind: "Gateway",
    group: GATEWAY_API_GROUP,
    version: "v1",
    plural: "gateways",
    scope: "Namespaced",
    crdName: "gateways.gateway.networking.k8s.io",
    label: "Gateway",
    labelPlural: "Gateways",
    description: "Traffic entry points: listeners, ports, and TLS",
    icon: "doorOpen",
    listColumns: [
      {
        id: "class",
        header: "Class",
        mono: true,
        accessor: (r) => spec(r).gatewayClassName as string | undefined,
      },
      {
        id: "listeners",
        header: "Listeners",
        accessor: (r) => {
          const listeners = spec(r).listeners;
          if (!Array.isArray(listeners)) return undefined;
          return listeners.map((l) => {
            const x = l as Record<string, unknown>;
            return `${x.protocol}:${x.port}`;
          });
        },
      },
      {
        id: "address",
        header: "Address",
        mono: true,
        accessor: (r) => {
          const addrs = (r.status as Record<string, unknown> | undefined)?.addresses;
          if (!Array.isArray(addrs)) return undefined;
          return addrs
            .map((a) => (a as Record<string, unknown>).value as string)
            .filter(Boolean)
            .join(", ");
        },
      },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${GATEWAY_API_GROUP}/v1`,
      kind: "Gateway",
      metadata: { name: "my-gateway", namespace },
      spec: {
        gatewayClassName: "agentgateway",
        listeners: [{ name: "http", protocol: "HTTP", port: 80, allowedRoutes: { namespaces: { from: "Same" } } }],
      },
    }),
    docsUrl: "https://gateway-api.sigs.k8s.io/api-types/gateway/",
  },
  {
    id: "httproutes",
    kind: "HTTPRoute",
    group: GATEWAY_API_GROUP,
    version: "v1",
    plural: "httproutes",
    scope: "Namespaced",
    crdName: "httproutes.gateway.networking.k8s.io",
    label: "HTTP Route",
    labelPlural: "HTTP Routes",
    description: "HTTP routing rules from gateways to backends",
    icon: "route",
    listColumns: [
      {
        id: "hostnames",
        header: "Hostnames",
        mono: true,
        accessor: (r) => (spec(r).hostnames as string[] | undefined) ?? "*",
      },
      {
        id: "parents",
        header: "Gateways",
        accessor: (r) => {
          const refs = spec(r).parentRefs;
          if (!Array.isArray(refs)) return undefined;
          return refs.map((p) => (p as Record<string, unknown>).name as string);
        },
      },
      {
        id: "rules",
        header: "Rules",
        accessor: (r) => {
          const rules = spec(r).rules;
          return Array.isArray(rules) ? String(rules.length) : "0";
        },
      },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${GATEWAY_API_GROUP}/v1`,
      kind: "HTTPRoute",
      metadata: { name: "my-route", namespace },
      spec: {
        parentRefs: [{ name: "my-gateway" }],
        rules: [
          {
            matches: [{ path: { type: "PathPrefix", value: "/" } }],
            backendRefs: [{ name: "my-backend", group: AGENTGATEWAY_GROUP, kind: "AgentgatewayBackend" }],
          },
        ],
      },
    }),
    docsUrl: "https://gateway-api.sigs.k8s.io/api-types/httproute/",
  },
  {
    id: "grpcroutes",
    kind: "GRPCRoute",
    group: GATEWAY_API_GROUP,
    version: "v1",
    plural: "grpcroutes",
    scope: "Namespaced",
    crdName: "grpcroutes.gateway.networking.k8s.io",
    label: "GRPC Route",
    labelPlural: "GRPC Routes",
    description: "gRPC routing rules from gateways to backends",
    icon: "waypoints",
    listColumns: [
      {
        id: "hostnames",
        header: "Hostnames",
        mono: true,
        accessor: (r) => (spec(r).hostnames as string[] | undefined) ?? "*",
      },
      {
        id: "parents",
        header: "Gateways",
        accessor: (r) => {
          const refs = spec(r).parentRefs;
          if (!Array.isArray(refs)) return undefined;
          return refs.map((p) => (p as Record<string, unknown>).name as string);
        },
      },
      {
        id: "rules",
        header: "Rules",
        accessor: (r) => {
          const rules = spec(r).rules;
          return Array.isArray(rules) ? String(rules.length) : "0";
        },
      },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${GATEWAY_API_GROUP}/v1`,
      kind: "GRPCRoute",
      metadata: { name: "my-grpc-route", namespace },
      spec: {
        parentRefs: [{ name: "my-gateway" }],
        rules: [{ backendRefs: [{ name: "my-service", port: 9000 }] }],
      },
    }),
    docsUrl: "https://gateway-api.sigs.k8s.io/api-types/grpcroute/",
  },
  {
    id: "tlsroutes",
    kind: "TLSRoute",
    group: GATEWAY_API_GROUP,
    version: "v1",
    plural: "tlsroutes",
    scope: "Namespaced",
    crdName: "tlsroutes.gateway.networking.k8s.io",
    versionFallbacks: ["v1alpha3", "v1alpha2"],
    label: "TLS Route",
    labelPlural: "TLS Routes",
    description: "SNI-based TLS passthrough routing from gateways to backends",
    icon: "route",
    listColumns: [
      {
        id: "hostnames",
        header: "Hostnames",
        mono: true,
        accessor: (r) => (spec(r).hostnames as string[] | undefined) ?? "*",
      },
      {
        id: "parents",
        header: "Gateways",
        accessor: (r) => {
          const refs = spec(r).parentRefs;
          if (!Array.isArray(refs)) return undefined;
          return refs.map((p) => (p as Record<string, unknown>).name as string);
        },
      },
      {
        id: "rules",
        header: "Rules",
        accessor: (r) => {
          const rules = spec(r).rules;
          return Array.isArray(rules) ? String(rules.length) : "0";
        },
      },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${GATEWAY_API_GROUP}/v1`,
      kind: "TLSRoute",
      metadata: { name: "my-tls-route", namespace },
      spec: {
        parentRefs: [{ name: "my-gateway", sectionName: "tls" }],
        hostnames: ["secure.example.com"],
        rules: [{ backendRefs: [{ name: "my-service", port: 8443 }] }],
      },
    }),
    docsUrl: "https://gateway-api.sigs.k8s.io/api-types/tlsroute/",
  },
  {
    id: "backendtlspolicies",
    kind: "BackendTLSPolicy",
    group: GATEWAY_API_GROUP,
    version: "v1",
    plural: "backendtlspolicies",
    scope: "Namespaced",
    crdName: "backendtlspolicies.gateway.networking.k8s.io",
    versionFallbacks: ["v1alpha3"],
    label: "Backend TLS Policy",
    labelPlural: "Backend TLS Policies",
    description: "TLS verification for connections from the gateway to backends",
    icon: "shieldCheck",
    listColumns: [
      { id: "targets", header: "Targets", mono: true, accessor: policyTargets },
      {
        id: "hostname",
        header: "Hostname",
        mono: true,
        accessor: (r) => {
          const validation = spec(r).validation as Record<string, unknown> | undefined;
          return validation?.hostname as string | undefined;
        },
      },
      {
        id: "ca",
        header: "CA",
        accessor: (r) => {
          const validation = spec(r).validation as Record<string, unknown> | undefined;
          if (typeof validation?.wellKnownCACertificates === "string") {
            return validation.wellKnownCACertificates as string;
          }
          const refs = validation?.caCertificateRefs;
          return Array.isArray(refs) ? `${refs.length} cert ref(s)` : undefined;
        },
      },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${GATEWAY_API_GROUP}/v1`,
      kind: "BackendTLSPolicy",
      metadata: { name: "my-backend-tls", namespace },
      spec: {
        targetRefs: [{ group: "", kind: "Service", name: "my-service" }],
        validation: { hostname: "my-service.example.com", wellKnownCACertificates: "System" },
      },
    }),
    docsUrl: "https://gateway-api.sigs.k8s.io/api-types/backendtlspolicy/",
  },
  {
    id: "referencegrants",
    kind: "ReferenceGrant",
    group: GATEWAY_API_GROUP,
    version: "v1",
    plural: "referencegrants",
    scope: "Namespaced",
    crdName: "referencegrants.gateway.networking.k8s.io",
    versionFallbacks: ["v1beta1"],
    label: "Reference Grant",
    labelPlural: "Reference Grants",
    description: "Permits references into this namespace from other namespaces",
    icon: "network",
    listColumns: [
      {
        id: "from",
        header: "From",
        mono: true,
        accessor: (r) => {
          const from = spec(r).from;
          if (!Array.isArray(from)) return undefined;
          return from.map((f) => {
            const x = f as Record<string, unknown>;
            return `${x.kind} @ ${x.namespace}`;
          });
        },
      },
      {
        id: "to",
        header: "To",
        mono: true,
        accessor: (r) => {
          const to = spec(r).to;
          if (!Array.isArray(to)) return undefined;
          return to.map((t) => {
            const x = t as Record<string, unknown>;
            return x.name ? `${x.kind}/${x.name}` : (x.kind as string);
          });
        },
      },
    ],
    getStatus: noStatus,
    template: (namespace) => ({
      apiVersion: `${GATEWAY_API_GROUP}/v1`,
      kind: "ReferenceGrant",
      metadata: { name: "my-reference-grant", namespace },
      spec: {
        from: [{ group: GATEWAY_API_GROUP, kind: "HTTPRoute", namespace: "default" }],
        to: [{ group: "", kind: "Service" }],
      },
    }),
    docsUrl: "https://gateway-api.sigs.k8s.io/api-types/referencegrant/",
  },
  {
    id: "listenersets",
    kind: "ListenerSet",
    group: GATEWAY_API_GROUP,
    version: "v1",
    plural: "listenersets",
    scope: "Namespaced",
    crdName: "listenersets.gateway.networking.k8s.io",
    label: "Listener Set",
    labelPlural: "Listener Sets",
    description: "Additional listeners attached to a parent gateway",
    icon: "layers",
    listColumns: [
      {
        id: "parent",
        header: "Gateway",
        mono: true,
        accessor: (r) => {
          const ref = spec(r).parentRef as Record<string, unknown> | undefined;
          if (!ref?.name) return undefined;
          return [ref.namespace, ref.name].filter(Boolean).join("/");
        },
      },
      {
        id: "listeners",
        header: "Listeners",
        accessor: (r) => {
          const listeners = spec(r).listeners;
          if (!Array.isArray(listeners)) return undefined;
          return listeners.map((l) => {
            const x = l as Record<string, unknown>;
            return `${x.protocol}:${x.port}`;
          });
        },
      },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${GATEWAY_API_GROUP}/v1`,
      kind: "ListenerSet",
      metadata: { name: "my-listener-set", namespace },
      spec: {
        parentRef: { group: GATEWAY_API_GROUP, kind: "Gateway", name: "my-gateway" },
        listeners: [{ name: "extra-http", protocol: "HTTP", port: 8080 }],
      },
    }),
    docsUrl: "https://gateway-api.sigs.k8s.io/geps/gep-1713/",
  },
  {
    id: "backends",
    kind: "AgentgatewayBackend",
    group: AGENTGATEWAY_GROUP,
    version: "v1alpha1",
    plural: "agentgatewaybackends",
    scope: "Namespaced",
    crdName: "agentgatewaybackends.agentgateway.dev",
    label: "Backend",
    labelPlural: "Backends",
    description: "AI providers, MCP servers, and static upstreams",
    icon: "server",
    listColumns: [
      { id: "type", header: "Type", accessor: backendType },
      { id: "detail", header: "Detail", mono: true, accessor: backendDetail },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${AGENTGATEWAY_GROUP}/v1alpha1`,
      kind: "AgentgatewayBackend",
      metadata: { name: "my-backend", namespace },
      spec: { ai: { provider: { openai: { model: "gpt-4o-mini" } } } },
    }),
    docsUrl: "https://agentgateway.dev/docs/",
  },
  {
    id: "policies",
    kind: "AgentgatewayPolicy",
    group: AGENTGATEWAY_GROUP,
    version: "v1alpha1",
    plural: "agentgatewaypolicies",
    scope: "Namespaced",
    crdName: "agentgatewaypolicies.agentgateway.dev",
    label: "Policy",
    labelPlural: "Policies",
    description: "Traffic, frontend, and backend policies attached to resources",
    icon: "shieldCheck",
    listColumns: [
      { id: "targets", header: "Targets", mono: true, accessor: policyTargets },
      { id: "sections", header: "Configures", accessor: policySections },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${AGENTGATEWAY_GROUP}/v1alpha1`,
      kind: "AgentgatewayPolicy",
      metadata: { name: "my-policy", namespace },
      spec: {
        targetRefs: [{ group: GATEWAY_API_GROUP, kind: "Gateway", name: "my-gateway" }],
        traffic: {},
      },
    }),
    docsUrl: "https://agentgateway.dev/docs/",
  },
  {
    id: "parameters",
    kind: "AgentgatewayParameters",
    group: AGENTGATEWAY_GROUP,
    version: "v1alpha1",
    plural: "agentgatewayparameters",
    scope: "Namespaced",
    crdName: "agentgatewayparameters.agentgateway.dev",
    label: "Parameters",
    labelPlural: "Parameters",
    description: "Data plane deployment settings referenced by gateway classes",
    icon: "settings2",
    listColumns: [
      {
        id: "image",
        header: "Image",
        mono: true,
        accessor: (r) => {
          const img = spec(r).image as Record<string, unknown> | undefined;
          if (!img) return undefined;
          return [img.registry, img.repository].filter(Boolean).join("/") + (img.tag ? `:${img.tag}` : "");
        },
      },
      {
        id: "logging",
        header: "Logging",
        accessor: (r) => {
          const logging = spec(r).logging as Record<string, unknown> | undefined;
          return logging ? [logging.level, logging.format].filter(Boolean).join(" · ") : undefined;
        },
      },
    ],
    getStatus: noStatus,
    template: (namespace) => ({
      apiVersion: `${AGENTGATEWAY_GROUP}/v1alpha1`,
      kind: "AgentgatewayParameters",
      metadata: { name: "agentgateway-params", namespace },
      spec: { logging: { level: "info", format: "json" } },
    }),
    docsUrl: "https://agentgateway.dev/docs/",
  },
];

const ENTERPRISE_GROUP = "enterpriseagentgateway.solo.io";

/** Solo enterprise companions to the agentgateway.dev kinds. */
export const ENTERPRISE_RESOURCES: ResourceDescriptor[] = [
  {
    id: "ent-backends",
    kind: "EnterpriseAgentgatewayBackend",
    group: ENTERPRISE_GROUP,
    version: "v1alpha1",
    plural: "enterpriseagentgatewaybackends",
    scope: "Namespaced",
    crdName: "enterpriseagentgatewaybackends.enterpriseagentgateway.solo.io",
    label: "Enterprise Backend",
    labelPlural: "Enterprise Backends",
    description: "Enterprise backends: entMcp tool modes plus all OSS backend types",
    icon: "server",
    listColumns: [
      { id: "type", header: "Type", accessor: backendType },
      { id: "detail", header: "Detail", mono: true, accessor: backendDetail },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${ENTERPRISE_GROUP}/v1alpha1`,
      kind: "EnterpriseAgentgatewayBackend",
      metadata: { name: "my-ent-backend", namespace },
      spec: {
        entMcp: {
          toolMode: "Standard",
          targets: [{ name: "my-target", static: { host: "mcp.example.com", port: 443 } }],
        },
      },
    }),
    docsUrl: "https://docs.solo.io/agentgateway/",
  },
  {
    id: "ent-policies",
    kind: "EnterpriseAgentgatewayPolicy",
    group: ENTERPRISE_GROUP,
    version: "v1alpha1",
    plural: "enterpriseagentgatewaypolicies",
    scope: "Namespaced",
    crdName: "enterpriseagentgatewaypolicies.enterpriseagentgateway.solo.io",
    label: "Enterprise Policy",
    labelPlural: "Enterprise Policies",
    description: "Enterprise policies: extAuth, rate limiting, CSRF, extProc, and more",
    icon: "shieldCheck",
    listColumns: [
      { id: "targets", header: "Targets", mono: true, accessor: policyTargets },
      { id: "sections", header: "Configures", accessor: policySections },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: `${ENTERPRISE_GROUP}/v1alpha1`,
      kind: "EnterpriseAgentgatewayPolicy",
      metadata: { name: "my-ent-policy", namespace },
      spec: {
        targetRefs: [{ group: GATEWAY_API_GROUP, kind: "Gateway", name: "my-gateway" }],
        traffic: {},
      },
    }),
    docsUrl: "https://docs.solo.io/agentgateway/",
  },
  {
    id: "ent-parameters",
    kind: "EnterpriseAgentgatewayParameters",
    group: ENTERPRISE_GROUP,
    version: "v1alpha1",
    plural: "enterpriseagentgatewayparameters",
    scope: "Namespaced",
    crdName: "enterpriseagentgatewayparameters.enterpriseagentgateway.solo.io",
    label: "Enterprise Parameters",
    labelPlural: "Enterprise Parameters",
    description: "Data plane settings plus shared extensions (extauth, ratelimiter, extCache)",
    icon: "settings2",
    listColumns: [
      {
        id: "extensions",
        header: "Extensions",
        accessor: (r) => {
          const ext = spec(r).sharedExtensions as Record<string, unknown> | undefined;
          if (!ext) return undefined;
          return Object.keys(ext).filter((k) => ext[k] !== undefined);
        },
      },
      {
        id: "logging",
        header: "Logging",
        accessor: (r) => {
          const logging = spec(r).logging as Record<string, unknown> | undefined;
          return logging ? [logging.level, logging.format].filter(Boolean).join(" · ") : undefined;
        },
      },
    ],
    getStatus: noStatus,
    template: (namespace) => ({
      apiVersion: `${ENTERPRISE_GROUP}/v1alpha1`,
      kind: "EnterpriseAgentgatewayParameters",
      metadata: { name: "ent-agentgateway-params", namespace },
      spec: { logging: { level: "info", format: "json" } },
    }),
    docsUrl: "https://docs.solo.io/agentgateway/",
  },
  {
    id: "ent-listenersets",
    kind: "EnterpriseListenerSet",
    group: "enterprise.solo.io",
    version: "v1alpha1",
    plural: "enterpriselistenersets",
    scope: "Namespaced",
    crdName: "enterpriselistenersets.enterprise.solo.io",
    label: "Enterprise Listener Set",
    labelPlural: "Enterprise Listener Sets",
    description: "Enterprise listener sets attached to gateways",
    icon: "layers",
    listColumns: [
      {
        id: "listeners",
        header: "Listeners",
        accessor: (r) => {
          const listeners = spec(r).listeners;
          if (!Array.isArray(listeners)) return undefined;
          return listeners.map((l) => {
            const x = l as Record<string, unknown>;
            return `${x.protocol}:${x.port}`;
          });
        },
      },
    ],
    getStatus: summarizeStatus,
    template: (namespace) => ({
      apiVersion: "enterprise.solo.io/v1alpha1",
      kind: "EnterpriseListenerSet",
      metadata: { name: "my-listener-set", namespace },
      spec: {
        listeners: [{ name: "http", protocol: "HTTP", port: 8080 }],
      },
    }),
    docsUrl: "https://docs.solo.io/agentgateway/",
  },
];

/** Read-only kinds used to populate pickers and reference panels. */
export const READONLY_RESOURCES: ResourceDescriptor[] = [
  {
    id: "namespaces",
    kind: "Namespace",
    group: "",
    version: "v1",
    plural: "namespaces",
    scope: "Cluster",
    crdName: "",
    label: "Namespace",
    labelPlural: "Namespaces",
    description: "Cluster namespaces",
    icon: "box",
    listColumns: [],
    getStatus: noStatus,
    template: () => ({ apiVersion: "v1", kind: "Namespace", metadata: { name: "" } }),
    readOnly: true,
  },
  {
    id: "services",
    kind: "Service",
    group: "",
    version: "v1",
    plural: "services",
    scope: "Namespaced",
    crdName: "",
    label: "Service",
    labelPlural: "Services",
    description: "Cluster services",
    icon: "network",
    listColumns: [],
    getStatus: noStatus,
    template: () => ({ apiVersion: "v1", kind: "Service", metadata: { name: "" } }),
    readOnly: true,
  },
  {
    id: "secrets",
    kind: "Secret",
    group: "",
    version: "v1",
    plural: "secrets",
    scope: "Namespaced",
    crdName: "",
    label: "Secret",
    labelPlural: "Secrets",
    description: "Secret names (data never exposed)",
    icon: "keyRound",
    listColumns: [],
    getStatus: noStatus,
    template: () => ({ apiVersion: "v1", kind: "Secret", metadata: { name: "" } }),
    readOnly: true,
  },
];

export const ALL_RESOURCES = [...RESOURCES, ...ENTERPRISE_RESOURCES, ...READONLY_RESOURCES];

export function getResource(id: string): ResourceDescriptor | undefined {
  return ALL_RESOURCES.find((r) => r.id === id);
}

export function getResourceByKind(kind: string): ResourceDescriptor | undefined {
  return ALL_RESOURCES.find((r) => r.kind === kind);
}
