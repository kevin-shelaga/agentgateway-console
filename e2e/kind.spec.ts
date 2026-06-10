import { expect, test } from "@playwright/test";

test("detects the kind cluster", async ({ request }) => {
  const response = await request.get("/api/cluster");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  expect(body.connected).toBe(true);
  expect(String(body.context)).toContain("kind");
});

test("loads CRD schemas from the cluster", async ({ request }) => {
  const response = await request.get("/api/schemas/gateways.gateway.networking.k8s.io");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  expect(body.source).toBe("cluster");
  expect(body.kind).toBe("Gateway");
  expect(body.versions.v1).toBeTruthy();
});

test("renders an empty managed resource list from the Kubernetes API", async ({ page }) => {
  await page.goto("/resources/gateways");

  await expect(page.getByRole("heading", { name: "Gateways" })).toBeVisible();
  await expect(page.getByText("No gateways yet")).toBeVisible({ timeout: 15_000 });
});

test("server-side dry-run rejects an invalid Gateway without persisting it", async ({ request }) => {
  const response = await request.post("/api/dry-run", {
    data: {
      mode: "create",
      manifest: {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: { name: "invalid-gateway", namespace: "default" },
        spec: {},
      },
    },
  });

  expect(response.ok()).toBeFalsy();
  const body = await response.json();
  expect(body.error.status).toBeGreaterThanOrEqual(400);
  expect(String(body.error.message ?? body.error.reason ?? "")).toContain("Gateway");

  const list = await request.get("/api/resources/gateway.networking.k8s.io/v1/gateways?namespace=default");
  expect(list.ok()).toBeTruthy();
  const listBody = await list.json();
  expect(listBody.items).toEqual([]);
});
