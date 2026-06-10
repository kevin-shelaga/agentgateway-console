import type { K8sResource } from "@/lib/types";

/** Realistic fixtures mirroring what the AKS verification cluster serves. */

export const gateway: K8sResource = {
  apiVersion: "gateway.networking.k8s.io/v1",
  kind: "Gateway",
  metadata: {
    name: "api-agentgateway",
    namespace: "agentgateway-system",
    creationTimestamp: "2026-05-19T12:00:00Z",
    resourceVersion: "1",
  },
  spec: {
    gatewayClassName: "agentgateway",
    listeners: [
      { name: "http", protocol: "HTTP", port: 80, allowedRoutes: { namespaces: { from: "All" } } },
      {
        name: "https",
        protocol: "HTTPS",
        port: 443,
        tls: { mode: "Terminate", certificateRefs: [{ name: "api-cert" }] },
      },
    ],
  },
  status: {
    addresses: [{ type: "IPAddress", value: "4.229.185.215" }],
    conditions: [
      { type: "Accepted", status: "True", lastTransitionTime: "2026-05-19T12:00:00Z" },
      { type: "Programmed", status: "True", lastTransitionTime: "2026-05-19T12:00:00Z" },
    ],
    listeners: [
      { name: "http", conditions: [{ type: "ResolvedRefs", status: "True" }] },
      { name: "https", conditions: [{ type: "ResolvedRefs", status: "True" }] },
    ],
  },
};

export const httpRoute: K8sResource = {
  apiVersion: "gateway.networking.k8s.io/v1",
  kind: "HTTPRoute",
  metadata: {
    name: "chat-route",
    namespace: "agents",
    creationTimestamp: "2026-05-20T12:00:00Z",
    resourceVersion: "2",
  },
  spec: {
    parentRefs: [{ name: "api-agentgateway", namespace: "agentgateway-system" }],
    hostnames: ["chat.example.com"],
    rules: [
      {
        matches: [{ path: { type: "PathPrefix", value: "/" } }],
        backendRefs: [
          { name: "openai-backend", group: "agentgateway.dev", kind: "AgentgatewayBackend" },
        ],
      },
    ],
  },
  status: {
    parents: [
      {
        parentRef: { name: "api-agentgateway", namespace: "agentgateway-system" },
        conditions: [
          { type: "Accepted", status: "True" },
          { type: "ResolvedRefs", status: "True" },
        ],
      },
    ],
  },
};

export const degradedRoute: K8sResource = {
  ...httpRoute,
  metadata: { ...httpRoute.metadata, name: "broken-route" },
  status: {
    parents: [
      {
        parentRef: { name: "api-agentgateway", namespace: "agentgateway-system" },
        conditions: [
          { type: "Accepted", status: "True" },
          {
            type: "ResolvedRefs",
            status: "False",
            reason: "BackendNotFound",
            message: "backend missing-svc not found",
          },
        ],
      },
    ],
  },
};

export const aiBackend: K8sResource = {
  apiVersion: "agentgateway.dev/v1alpha1",
  kind: "AgentgatewayBackend",
  metadata: {
    name: "openai-backend",
    namespace: "agents",
    creationTimestamp: "2026-05-21T12:00:00Z",
    resourceVersion: "3",
  },
  spec: { ai: { provider: { openai: { model: "gpt-4o-mini" } } } },
  status: { conditions: [{ type: "Accepted", status: "True" }] },
};

export const mcpBackend: K8sResource = {
  apiVersion: "agentgateway.dev/v1alpha1",
  kind: "AgentgatewayBackend",
  metadata: { name: "mcp-backend", namespace: "agents", resourceVersion: "4" },
  spec: {
    mcp: {
      targets: [{ name: "fetcher", static: { host: "mcp.svc.local", port: 80, protocol: "SSE" } }],
    },
  },
};

export const staticBackend: K8sResource = {
  apiVersion: "agentgateway.dev/v1alpha1",
  kind: "AgentgatewayBackend",
  metadata: { name: "static-backend", namespace: "agents", resourceVersion: "5" },
  spec: { static: { host: "example.com", port: 443 } },
};

export const policy: K8sResource = {
  apiVersion: "agentgateway.dev/v1alpha1",
  kind: "AgentgatewayPolicy",
  // targetRefs are namespace-local: must live beside the Gateway it targets.
  metadata: { name: "cors-policy", namespace: "agentgateway-system", resourceVersion: "6" },
  spec: {
    targetRefs: [{ group: "gateway.networking.k8s.io", kind: "Gateway", name: "api-agentgateway" }],
    traffic: { cors: { allowOrigins: ["https://example.com"] } },
  },
};

export const gatewayClass: K8sResource = {
  apiVersion: "gateway.networking.k8s.io/v1",
  kind: "GatewayClass",
  metadata: { name: "agentgateway", resourceVersion: "7" },
  spec: { controllerName: "agentgateway.dev/agentgateway" },
  status: { conditions: [{ type: "Accepted", status: "True" }] },
};

export const parameters: K8sResource = {
  apiVersion: "agentgateway.dev/v1alpha1",
  kind: "AgentgatewayParameters",
  metadata: { name: "agw-params", namespace: "agentgateway-system", resourceVersion: "8" },
  spec: { logging: { level: "info", format: "json" }, image: { tag: "v1.0.0" } },
};

export const namespaceList: K8sResource[] = ["default", "agents", "agentgateway-system"].map(
  (name) => ({ apiVersion: "v1", kind: "Namespace", metadata: { name } }),
);

export const serviceList: K8sResource[] = [
  { apiVersion: "v1", kind: "Service", metadata: { name: "my-svc", namespace: "agents" } },
];

export const secretList: K8sResource[] = [
  { apiVersion: "v1", kind: "Secret", metadata: { name: "openai-key", namespace: "agents" } },
];
