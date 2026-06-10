<div align="center">
  <img src="public/favicon.svg" alt="agentgateway" width="64" />
  <h1>agentgateway console</h1>
  <p><b>Kubernetes clickops for <a href="https://agentgateway.dev">agentgateway</a></b> — dashboards, resource browsing, and fully validated create/edit/delete for everything you'd otherwise manage with <code>kubectl apply</code>.</p>
</div>

---

The [agentgateway](https://github.com/agentgateway/agentgateway) project ships a UI for its standalone (file-config) mode, but the Kubernetes deployment mode — driven by Gateway API resources plus the `agentgateway.dev` CRDs — has been kubectl-only. This console fills that gap.

## What it manages

| Kind | Group | Purpose |
|---|---|---|
| `GatewayClass` | gateway.networking.k8s.io | Gateway implementations + parameters |
| `Gateway` | gateway.networking.k8s.io | Listeners, ports, TLS |
| `HTTPRoute` / `GRPCRoute` | gateway.networking.k8s.io | Routing rules |
| `AgentgatewayBackend` | agentgateway.dev | AI/LLM providers, MCP servers, static upstreams |
| `AgentgatewayPolicy` | agentgateway.dev | Traffic/frontend/backend policy attachment |
| `AgentgatewayParameters` | agentgateway.dev | Data plane deployment settings |

Namespaces, Services, and Secrets are read **names-only** to power picker dropdowns — secret payloads never leave the server.

## Features

- **Dashboard** — gateway fleet health from status conditions, backend breakdown, degraded-resource triage with deep links.
- **List & detail pages** — namespace filter, search, status badges, condition timelines, and a resolved reference graph (which routes attach to a gateway, which policies target what).
- **Split form ⇄ YAML editor** — guided forms for the common cases, a schema-aware YAML editor for 100% of the spec. Both edit the same document, synced live in both directions.
- **Three-layer validation, driven by the CRDs themselves**:
  1. **Structural** — AJV validates against the CRD `openAPIV3Schema` as you type (schemas read live from the cluster, bundled fallback).
  2. **Server dry-run** — every save first runs `dryRun=All` so CEL `x-kubernetes-validations` rules and admission webhooks execute *without persisting*; failures map back to fields.
  3. **Apply** — only after dry-run passes.
- **Kubeconfig context switcher** — operate any cluster your kubeconfig can reach; in-cluster ServiceAccount config is used automatically when deployed to Kubernetes.

## Quickstart

```bash
npm install
npm run dev          # http://localhost:3000
```

The server-side API routes load your default kubeconfig (`~/.kube/config`). Switch contexts from the widget at the bottom of the sidebar.

```bash
npm test             # vitest unit tests
npm run build        # production build
node scripts/extract-schemas.mjs   # refresh bundled CRD schema fallbacks
```

### Running in-cluster

When `KUBERNETES_SERVICE_HOST` is set, the BFF uses the pod's ServiceAccount. The ServiceAccount needs `get/list` on the kinds above plus `create/update/delete` on the writable ones, and `get` on `customresourcedefinitions` for live schemas.

## Architecture

```
Browser ──> Next.js API routes (BFF) ──> Kubernetes API
              │  GVK allowlist · secret stripping · dry-run proxy
              │  /api/schemas — live CRD openAPIV3Schema (bundled fallback)
              └  @kubernetes/client-node (kubeconfig or in-cluster)
```

- `src/lib/registry.ts` — one descriptor per kind (columns, status extraction, templates) drives the generic list/detail/edit pages.
- `src/lib/conditions.ts` — flattens Gateway listener + route parent conditions into a health summary.
- `src/lib/validation.ts` — AJV over CRD schemas (the structural layer; CEL rules run server-side via dry-run).
- `src/components/editor/resource-editor.tsx` — the split form/YAML editor and the dry-run-gated save pipeline.

## License

Apache-2.0 — same as agentgateway. Brand assets (logo) belong to the agentgateway project.
