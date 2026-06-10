# agentgateway-console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Kubernetes clickops console for agentgateway — dashboards, list/detail pages, and validated create/edit/delete for the agentgateway.dev CRDs plus Gateway API resources.

**Architecture:** Next.js 15 full-stack app. API routes act as a thin BFF over `@kubernetes/client-node` (kubeconfig locally, ServiceAccount in-cluster). A resource registry drives generic list/detail/edit pages; kind-specific forms cover the common cases with a schema-validated YAML editor (CodeMirror 6 + AJV) covering 100%. Saves go through server-side dry-run before apply.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 4, shadcn/ui, TanStack Query 5, @kubernetes/client-node, AJV, CodeMirror 6 (`@codemirror/lang-yaml`), `yaml`, next-themes, Vitest.

**Deviation from spec:** YAML editor uses CodeMirror 6 instead of Monaco. monaco-yaml requires custom web-worker bundling that fights Next.js/Turbopack; CodeMirror bundles cleanly and our AJV layer supplies the same schema diagnostics. Spec updated.

**Verification constraint:** The available kubeconfig context (`REDACTED-CLUSTER`) is a real cluster. All verification against it must be read-only (GET/list) or `dryRun=All`. No real writes without explicit user go-ahead.

---

### Task 1: Scaffold + brand

**Files:** Create Next.js app at repo root (`create-next-app` in temp dir, move into existing git repo), `src/app/globals.css` (agentgateway oklch tokens), `public/favicon.svg`, `public/banner-{dark,light}.svg` (copied from ../agentgateway), `src/components/agentgateway-logo.tsx` (copied), `components.json`.

- [ ] Scaffold: `npx create-next-app@latest --ts --tailwind --app --src-dir --no-eslint --use-npm` (merge into repo root; keep our docs/)
- [ ] Install deps: `npm i @tanstack/react-query @kubernetes/client-node ajv ajv-formats yaml next-themes lucide-react codemirror @codemirror/lang-yaml @codemirror/lint @uiw/react-codemirror @uiw/codemirror-theme-github sonner` and `npm i -D vitest @vitejs/plugin-react`
- [ ] `npx shadcn@latest init` (new-york, neutral, CSS variables) and add: button card badge dialog alert-dialog dropdown-menu input label select separator sheet sidebar skeleton table tabs tooltip textarea switch command popover alert scroll-area breadcrumb
- [ ] Copy brand assets from `../agentgateway` (favicon.svg, banner-dark.svg, banner-light.svg, logo component); port the `#7734be` primary + oklch token set from `../agentgateway/ui/src/app/globals.css` into `globals.css` with sidebar tokens; Geist fonts via `next/font`
- [ ] Verify: `npm run build` passes
- [ ] Commit

### Task 2: Bundled CRD schemas

**Files:** Create `scripts/extract-schemas.mjs`, `src/lib/schemas/bundled/<crd-name>.json` (one per CRD), `src/lib/schemas/index.ts`.

- [ ] Script reads `../agentgateway/controller/install/helm/agentgateway-crds/templates/*.yaml`, and Gateway API standard CRDs (from a local sibling repo if found, else `https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/standard-install.yaml`); for each CRD emits `{ group, kind, plural, scope, versions: { [version]: openAPIV3Schema } }` as JSON
- [ ] Run script; verify 7+ JSON files exist (3 agentgateway + gatewayclasses/gateways/httproutes/grpcroutes)
- [ ] `src/lib/schemas/index.ts`: `getBundledSchema(crdName: string)` lazy `require` of the JSON
- [ ] Commit

### Task 3: K8s client + error parsing (lib)

**Files:** Create `src/lib/k8s/client.ts`, `src/lib/k8s/errors.ts`, `src/lib/k8s/errors.test.ts`, `vitest.config.ts`.

- [ ] `errors.ts`:

```ts
export interface K8sErrorCause { field?: string; reason?: string; message: string }
export interface ParsedK8sError { status: number; reason: string; message: string; causes: K8sErrorCause[] }

export function parseK8sError(err: unknown): ParsedK8sError {
  // @kubernetes/client-node v1 throws ApiException with .code and .body (JSON string or object)
  const fallback: ParsedK8sError = { status: 500, reason: "Unknown", message: err instanceof Error ? err.message : String(err), causes: [] };
  const anyErr = err as { code?: number; body?: unknown };
  if (!anyErr?.body) return fallback;
  let body: Record<string, unknown>;
  try { body = typeof anyErr.body === "string" ? JSON.parse(anyErr.body) : (anyErr.body as Record<string, unknown>); }
  catch { return { ...fallback, status: anyErr.code ?? 500 }; }
  const details = (body.details ?? {}) as { causes?: K8sErrorCause[] };
  return {
    status: (body.code as number) ?? anyErr.code ?? 500,
    reason: (body.reason as string) ?? "Unknown",
    message: (body.message as string) ?? fallback.message,
    causes: details.causes ?? [],
  };
}
```

- [ ] Test (`errors.test.ts`): parses an ApiException-shaped object with JSON-string body containing `details.causes[{field:"spec.ai.provider", message:"Required value"}]`; falls back gracefully on plain Error. Run `npx vitest run` — fails, then implement, then passes.
- [ ] `client.ts`: `getKubeConfig(context?: string)` → loads default (or in-cluster when `KUBERNETES_SERVICE_HOST` set), optionally `setCurrentContext`; `getObjectClient(context?)` → `KubernetesObjectApi.makeApiClient(kc)`; `getCoreClient`, `getApiextensionsClient`. Verify exact v1 client API via context7 docs during implementation.
- [ ] Commit

### Task 4: BFF API routes

**Files:** Create `src/app/api/resources/[group]/[version]/[plural]/route.ts` (GET list, POST create), `src/app/api/resources/[group]/[version]/[plural]/[namespace]/[name]/route.ts` (GET, PUT, DELETE; namespace `_cluster` = cluster-scoped), `src/app/api/dry-run/route.ts`, `src/app/api/schemas/[crd]/route.ts`, `src/app/api/contexts/route.ts`, `src/app/api/cluster/route.ts`, `src/lib/k8s/registry-server.ts` (GVK allowlist).

- [ ] Allowlist: only the 7 managed GVKs + read-only namespaces/services/secrets (secrets: names/metadata only — strip `data`/`stringData` from responses). Reject others with 403.
- [ ] List/create/get/update/delete via `KubernetesObjectApi`; context from `x-kube-context` header; all errors → `parseK8sError` JSON with proper status
- [ ] `dry-run`: POST body = manifest + `{mode: "create"|"update"}` → create/replace with `dryRun: "All"`, `fieldValidation: "Strict"`; returns `{ok:true}` or parsed error
- [ ] `schemas/[crd]`: try `readCustomResourceDefinition(crd)` from cluster → extract `spec.versions[].schema.openAPIV3Schema`; fallback to bundled JSON; 404 if neither
- [ ] `contexts`: GET → `{contexts: string[], current: string}` from kubeconfig
- [ ] `cluster`: GET → `/version`-style probe → `{connected, context, version?}` or `{connected:false, error}`
- [ ] Verify with curl against dev server + real cluster (read-only): list gateways, fetch schema, dry-run an invalid AgentgatewayBackend (expect 4xx with causes)
- [ ] Commit

### Task 5: Resource registry + conditions (lib)

**Files:** Create `src/lib/registry.ts`, `src/lib/conditions.ts`, `src/lib/conditions.test.ts`, `src/lib/types.ts`.

- [ ] `types.ts`: `K8sResource` (metadata/spec/status loose typing), `ResourceDescriptor` `{ id, kind, group, version, plural, scope, crdName, icon, description, listColumns: ColumnDef[], getStatus(res): StatusSummary, template(namespace): K8sResource, docsUrl }`
- [ ] `conditions.ts`: `extractConditions(res)` — reads `status.conditions`, Gateway `status.listeners[].conditions`, HTTPRoute/GRPCRoute `status.parents[].conditions`; `summarize(conditions)` → `{state: "Healthy"|"Degraded"|"Unknown"|"Pending", message}` (Healthy: all True for positive-polarity types like Accepted/Programmed/ResolvedRefs; Degraded: any False; Unknown: none)
- [ ] Tests: Gateway with Programmed=True+Accepted=True → Healthy; HTTPRoute with parents[0] Accepted=False → Degraded with message; empty status → Unknown. TDD: fail → implement → pass.
- [ ] `registry.ts`: descriptors for all 7 kinds + readonly kinds, with sensible `template()` starters (e.g. Backend template = OpenAI AI backend skeleton; Gateway = one HTTP listener on 80 with gatewayClassName agentgateway)
- [ ] Commit

### Task 6: Client data layer

**Files:** Create `src/lib/api-client.ts`, `src/lib/hooks.ts`, `src/components/providers.tsx` (QueryClient + theme), modify `src/app/layout.tsx`.

- [ ] `api-client.ts`: typed fetch wrappers for every BFF endpoint; context header injected from localStorage (`agc.context`)
- [ ] `hooks.ts`: `useResourceList(desc, namespace?)`, `useResource(desc, ns, name)`, `useClusterInfo()`, `useContexts()`, `useNamespaces()`, mutations (`useSaveResource` = dry-run→apply pipeline, `useDeleteResource`) with query invalidation
- [ ] Commit

### Task 7: Shell + list pages

**Files:** Create `src/components/app-sidebar.tsx`, `src/components/cluster-status.tsx` (context switcher + connection state), `src/components/status-badge.tsx`, `src/components/namespace-filter.tsx`, `src/components/resource-table.tsx`, `src/app/resources/[kind]/page.tsx`, `src/components/theme-toggle.tsx`, error/empty/unreachable states.

- [ ] Sidebar: logo, Dashboard, grouped nav (Gateway API: Classes/Gateways/HTTP Routes/GRPC Routes; Agentgateway: Backends/Policies/Parameters), cluster status footer with context switcher
- [ ] Generic list page driven by registry: header w/ create CTA, namespace filter, search, table with status badges + age + kind-specific columns, row dropdown (View/Edit/YAML/Delete with confirm dialog), skeleton loading, empty state, cluster-unreachable full-page state
- [ ] Verify in browser against real cluster (read-only)
- [ ] Commit

### Task 8: Detail page

**Files:** Create `src/app/resources/[kind]/[namespace]/[name]/page.tsx`, `src/components/conditions-card.tsx`, `src/components/related-resources.tsx`, `src/components/yaml-view.tsx`, `src/lib/references.ts`.

- [ ] `references.ts`: resolve relationships — HTTPRoute→parentRefs Gateways + backendRefs; Policy→targetRefs; Gateway→gatewayClassName + attached routes (client-side join over cached lists)
- [ ] Detail: breadcrumb header, status summary, tabs (Overview: metadata, conditions table, related resources; YAML: read-only highlighted view w/ copy), Edit + Delete actions
- [ ] Commit

### Task 9: Validation + YAML editor

**Files:** Create `src/lib/validation.ts`, `src/lib/validation.test.ts`, `src/components/yaml-editor.tsx`.

- [ ] `validation.ts`: `compileValidator(openAPIV3Schema)` using AJV (`strict:false`, ajv-formats, no-op `int32/int64/byte` formats, strip/ignore `x-kubernetes-*` keywords via `addKeyword`), `validateResource(doc, schema)` → `{path, message}[]`; validate only `spec` subtree against schema's spec property plus top-level required
- [ ] Tests: valid minimal AgentgatewayBackend (from bundled schema) → no errors; missing required field → error with path; wrong type → error. TDD.
- [ ] `yaml-editor.tsx`: CodeMirror with yaml lang, lint gutter fed by `yaml` parse errors + AJV results (mapped to line positions via `yaml` CST node ranges when possible, else doc-level), dark theme matching brand
- [ ] Commit

### Task 10: Resource editor (form ⇄ YAML) + create/edit pages

**Files:** Create `src/components/editor/resource-editor.tsx`, `src/components/editor/editor-context.tsx`, `src/app/resources/[kind]/new/page.tsx`, `src/app/resources/[kind]/[namespace]/[name]/edit/page.tsx`, `src/components/editor/validation-panel.tsx`, `src/components/editor/metadata-fields.tsx`.

- [ ] Editor state: single source of truth = JS object; form edits mutate object → YAML re-serialized (preserving doc via `yaml` Document updates where feasible); YAML edits parse → object → form re-renders; parse errors freeze form with banner
- [ ] Layout: split view (form left, YAML right, toggleable), metadata section (name/namespace/labels), validation panel (AJV live + dry-run results), Save flow = AJV gate → `POST /api/dry-run` → on success apply → toast → navigate to detail; dry-run failure renders causes (field-mapped where path matches a form field)
- [ ] Kinds without a custom form yet fall back to YAML-only editor — fully functional
- [ ] Commit

### Task 11: Kind-specific forms

**Files:** Create `src/components/forms/backend-form.tsx` (+ provider sub-forms), `src/components/forms/policy-form.tsx`, `src/components/forms/gateway-form.tsx`, `src/components/forms/httproute-form.tsx`, `src/components/forms/grpcroute-form.tsx`, `src/components/forms/parameters-form.tsx`, `src/components/forms/gatewayclass-form.tsx`, `src/components/forms/pickers.tsx` (namespace/service/secret/gateway pickers fed by read-only APIs).

- [ ] Backend: type selector (AI / MCP / Static / dynamicForwardProxy / AWS / A2A); AI: provider cards (OpenAI, Anthropic, Bedrock, Vertex, AzureOpenAI, Gemini) + model + auth secret picker; MCP: target list editor (name + http/sse/stdio); Static: host/port
- [ ] Policy: targetRef builder (kind picker → live resource picker), common policy sections (CORS, timeout/retry, rate limit, header modify, extauth) as progressive-disclosure cards; anything else via YAML side
- [ ] Gateway: gatewayClassName picker, listeners editor (name/port/protocol/hostname, TLS w/ secret picker); HTTPRoute: parentRefs picker, hostnames, rules editor (matches + backendRefs incl. AgentgatewayBackend); GRPCRoute analogous; Parameters: image/logging/resources basics; GatewayClass: controllerName + parametersRef
- [ ] Each form is a pure function of the shared editor object (read path, write path) so YAML sync stays free
- [ ] Commit per form group (3 commits ok)

### Task 12: Dashboard

**Files:** Create `src/app/page.tsx` (replace), `src/components/dashboard/*` (fleet-health, counts, backend-breakdown, attention-list, policy-overview, quick-actions).

- [ ] Aggregates over cached lists: gateway fleet (per-gateway health chips), resource counts by kind/namespace, backend type donut/bars (CSS, no chart lib), policies by target kind, "Needs attention" (Degraded resources w/ deep links), quick actions (Create Backend/Gateway/Route/Policy)
- [ ] Commit

### Task 13: Polish + docs + verification

**Files:** Create `README.md`, `LICENSE` (Apache-2.0, matching agentgateway), `.gitignore` review; modify spec (Monaco→CodeMirror note).

- [ ] README: what it is, screenshot placeholder, quickstart (`npm i && npm run dev`), kubeconfig/in-cluster notes, schema/validation explanation, repo layout
- [ ] Full check: `npx vitest run` green, `npm run build` green, browser pass over all pages against cluster (read-only), dry-run validation demo
- [ ] Commit

## Self-review

- Spec coverage: dashboard (T12), lists (T7), details (T8), create/edit all kinds (T10/11), CRD validation client+server (T9/T4), read-only core resources (T4/T11 pickers), brand assets (T1), error handling (T3/T4/T7), tests (T3/T5/T9). ✔
- No placeholder steps; code shown for core lib; UI tasks specify exact files/behavior. ✔
- Names consistent: `parseK8sError`, `ResourceDescriptor`, `useSaveResource` used consistently across tasks. ✔
