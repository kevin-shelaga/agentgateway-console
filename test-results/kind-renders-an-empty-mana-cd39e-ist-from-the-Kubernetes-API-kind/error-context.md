# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: kind.spec.ts >> renders an empty managed resource list from the Kubernetes API
- Location: e2e/kind.spec.ts:22:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('No gateways yet')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText('No gateways yet')

```

```yaml
- link "agentgatewayconsole":
  - /url: /
  - img
  - text: agentgatewayconsole
- list:
  - listitem:
    - link "Dashboard":
      - /url: /
  - listitem:
    - link "Playground":
      - /url: /playground
- text: Gateway API
- list:
  - listitem:
    - link "Gateway Classes":
      - /url: /resources/gatewayclasses
  - listitem:
    - link "Gateways":
      - /url: /resources/gateways
  - listitem:
    - link "HTTP Routes":
      - /url: /resources/httproutes
  - listitem:
    - link "GRPC Routes":
      - /url: /resources/grpcroutes
- text: Agentgateway
- list:
  - listitem:
    - link "Backends":
      - /url: /resources/backends
  - listitem:
    - link "Policies":
      - /url: /resources/policies
  - listitem:
    - link "Parameters":
      - /url: /resources/parameters
  - listitem:
    - link "API Keys":
      - /url: /api-keys
- button "Connecting—"
- button "Toggle theme"
- button "Toggle Sidebar"
- main:
  - heading "Gateways" [level=1]
  - paragraph: "Traffic entry points: listeners, ports, and TLS"
  - link "Create Gateway":
    - /url: /resources/gateways/new
  - combobox
  - textbox "Search gateways…"
  - button "Refresh"
- region "Notifications alt+T"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("detects the kind cluster", async ({ request }) => {
  4  |   const response = await request.get("/api/cluster");
  5  |   expect(response.ok()).toBeTruthy();
  6  | 
  7  |   const body = await response.json();
  8  |   expect(body.connected).toBe(true);
  9  |   expect(String(body.context)).toContain("kind");
  10 | });
  11 | 
  12 | test("loads CRD schemas from the cluster", async ({ request }) => {
  13 |   const response = await request.get("/api/schemas/gateways.gateway.networking.k8s.io");
  14 |   expect(response.ok()).toBeTruthy();
  15 | 
  16 |   const body = await response.json();
  17 |   expect(body.source).toBe("cluster");
  18 |   expect(body.kind).toBe("Gateway");
  19 |   expect(body.versions.v1).toBeTruthy();
  20 | });
  21 | 
  22 | test("renders an empty managed resource list from the Kubernetes API", async ({ page }) => {
  23 |   await page.goto("/resources/gateways");
  24 | 
  25 |   await expect(page.getByRole("heading", { name: "Gateways" })).toBeVisible();
> 26 |   await expect(page.getByText("No gateways yet")).toBeVisible({ timeout: 15_000 });
     |                                                   ^ Error: expect(locator).toBeVisible() failed
  27 | });
  28 | 
  29 | test("server-side dry-run rejects an invalid Gateway without persisting it", async ({ request }) => {
  30 |   const response = await request.post("/api/dry-run", {
  31 |     data: {
  32 |       mode: "create",
  33 |       manifest: {
  34 |         apiVersion: "gateway.networking.k8s.io/v1",
  35 |         kind: "Gateway",
  36 |         metadata: { name: "invalid-gateway", namespace: "default" },
  37 |         spec: {},
  38 |       },
  39 |     },
  40 |   });
  41 | 
  42 |   expect(response.ok()).toBeFalsy();
  43 |   const body = await response.json();
  44 |   const errorMessage = String(body.error.message ?? body.error.reason ?? "");
  45 | 
  46 |   expect(body.error.status).toBeGreaterThanOrEqual(400);
  47 |   expect(errorMessage.length).toBeGreaterThan(0);
  48 | 
  49 |   const list = await request.get("/api/resources/gateway.networking.k8s.io/v1/gateways?namespace=default");
  50 |   expect(list.ok()).toBeTruthy();
  51 |   const listBody = await list.json();
  52 |   expect(listBody.items).toEqual([]);
  53 | });
  54 | 
```