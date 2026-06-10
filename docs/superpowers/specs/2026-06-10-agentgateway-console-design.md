# agentgateway-console — Design Spec

**Date:** 2026-06-10
**Status:** Approved

## Purpose

A standalone web console for operating [agentgateway](https://github.com/agentgateway/agentgateway) in Kubernetes via clickops: dashboards, resource lists, and full create/edit/delete for everything a user would otherwise manage with `kubectl apply` of CRDs. Validation is driven by the CRDs themselves.

The existing `agentgateway/ui` manages only the standalone (file-based) config mode via the Rust binary's `/config` endpoint. This console fills the gap for the Kubernetes/CRD-driven deployment mode.

## Scope

### Managed (full read/write)

| Kind | Group/Version | Notes |
|---|---|---|
| AgentgatewayBackend | agentgateway.dev/v1alpha1 | AI/LLM, MCP, static, AWS, A2A backends |
| AgentgatewayPolicy | agentgateway.dev/v1alpha1 | Gateway API Direct policy attachment |
| AgentgatewayParameters | agentgateway.dev/v1alpha1 | GatewayClass deployment parameters |
| GatewayClass | gateway.networking.k8s.io/v1 | Cluster-scoped |
| Gateway | gateway.networking.k8s.io/v1 | |
| HTTPRoute | gateway.networking.k8s.io/v1 | |
| GRPCRoute | gateway.networking.k8s.io/v1 | |

### Read-only (reference/picker support)

Namespaces, Services, Secrets (names + metadata only — never secret data).

## Architecture

Next.js 15 (App Router) full-stack app. Three layers:

### 1. BFF API routes (`src/app/api/`)

Thin Kubernetes proxy using `@kubernetes/client-node`. Loads kubeconfig locally (context switching supported) or in-cluster ServiceAccount config when deployed to a cluster.

- `GET/POST /api/resources/[group]/[version]/[plural]` — list / create (namespace via query param)
- `GET/PUT/DELETE /api/resources/[group]/[version]/[plural]/[namespace]/[name]` — get / update / delete
- `POST /api/dry-run` — server-side dry-run apply (`dryRun=All`, `fieldValidation=Strict`); executes CEL `x-kubernetes-validations` and admission
- `GET /api/schemas/[crdName]` — openAPIV3Schema read live from the cluster's installed CRDs; bundled schema fallback (extracted from agentgateway + Gateway API CRD manifests) when unavailable
- `GET /api/contexts` — list/switch kubeconfig contexts
- `GET /api/cluster` — connectivity/health probe powering a "cluster unreachable" state

### 2. Resource model (`src/lib/`)

A **resource registry**: one descriptor per managed kind — GVK, plural, scope, icon, list columns, status-condition extraction (Accepted/Programmed/ResolvedRefs), reference resolution (e.g. HTTPRoute → parent Gateway, Policy → targetRefs), default new-resource template, and form definition. List/detail/edit pages are generic and driven by the registry; only forms are kind-specific.

### 3. UI

- **Dashboard** — gateway fleet health from status conditions, resource counts, backend breakdown by type, policy attachment overview, "needs attention" list (resources with failing conditions).
- **List pages** per kind — namespace filter, text search, status badges, row actions (edit, YAML, delete), empty states with create CTAs.
- **Detail pages** — Overview tab (conditions, resolved references, related resources), YAML tab, delete with confirmation.
- **Create/Edit** — split view: hand-built form (left) two-way synced with a Monaco YAML editor (right). Forms cover the common 90% (AI provider backends, MCP backends, static backends, traffic policies, gateways, routes); YAML covers 100% of the spec. monaco-yaml provides schema completion/diagnostics.

## Validation

Three layers, in order:

1. **AJV structural validation** against the CRD openAPIV3Schema — instant, client-side, as-you-type in both form and YAML.
2. **Server-side dry-run** on save — executes CEL validation rules and admission webhooks without persisting. Errors parsed from the K8s `Status` object and mapped to form fields where the field path matches; otherwise shown in a validation panel.
3. **Real apply** only after dry-run passes.

## Brand / visual

Agentgateway identity, elevated: purple `#7734be` primary, Geist + Geist Mono, oklch token system, dark-mode-first with light mode. Assets copied from the agentgateway repo: `ui/public/favicon.svg`, the logo SVG component, `img/banner-dark.svg`, `img/banner-light.svg`. shadcn/ui ("new-york") component primitives. Denser, more data-rich dashboard treatment than the existing standalone UI.

## Error handling

- K8s API errors parsed into typed results (`reason`, `message`, field `causes`).
- Cluster unreachable / no kubeconfig → dedicated full-page state with guidance, not broken components.
- Dry-run/admission failures rendered inline pre-apply; never silently swallowed.

## Testing

- Vitest: resource registry behavior, condition extraction, schema fallback logic, error→field mapping, form↔YAML sync logic.
- Manual verification against a kind cluster with agentgateway CRDs installed.

## Out of scope (v1)

- Auth/multi-user/RBAC UI (relies on kubeconfig identity)
- Metrics/traffic observability dashboards
- Editing core resources (Services, Secrets)
- agentgateway standalone (non-K8s) config mode
