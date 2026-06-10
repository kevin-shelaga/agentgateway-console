# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: kind.spec.ts >> detects the kind cluster
- Location: e2e/kind.spec.ts:3:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
> 8  |   expect(body.connected).toBe(true);
     |                          ^ Error: expect(received).toBe(expected) // Object.is equality
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
  26 |   await expect(page.getByText("No gateways yet")).toBeVisible({ timeout: 15_000 });
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