import { expect, type Page, test } from "@playwright/test";

export async function mockConnectedCluster(page: Page) {
  await page.route("**/api/cluster**", async (route) => {
    await route.fulfill({ json: { connected: true, context: "smoke" } });
  });
  await page.route("**/api/contexts**", async (route) => {
    await route.fulfill({
      json: { contexts: ["smoke"], current: "smoke", inCluster: false },
    });
  });
  await page.route("**/api/infra**", async (route) => {
    await route.fulfill({ json: { metricsAvailable: false, pods: [] } });
  });
  await page.route("**/api/resources/**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
}

export async function mockUnreachableCluster(page: Page) {
  await page.route("**/api/cluster**", async (route) => {
    await route.fulfill({
      json: { connected: false, context: null, error: "No kubeconfig found" },
    });
  });
  await page.route("**/api/contexts**", async (route) => {
    await route.fulfill({
      json: { contexts: [], current: "", inCluster: false },
    });
  });
  await page.route("**/api/infra**", async (route) => {
    await route.fulfill({ json: { metricsAvailable: false, pods: [] } });
  });
  await page.route("**/api/resources/**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
}

test("renders the dashboard shell with empty API responses", async ({ page }) => {
  await mockConnectedCluster(page);

  await page.goto("/");

  await expect(page.getByRole("link", { name: /agentgateway console/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Dashboard$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("navigates to a resource list route", async ({ page }) => {
  await mockConnectedCluster(page);

  await page.goto("/");
  await page.getByRole("link", { name: /^Gateways$/ }).first().click();

  await expect(page).toHaveURL(/\/resources\/gateways$/);
  await expect(page.getByRole("heading", { name: "Gateways" })).toBeVisible();
});

test("shows the cluster-unreachable state without crashing", async ({ page }) => {
  await mockUnreachableCluster(page);

  await page.goto("/");

  await expect(page.getByText("Cluster unreachable")).toBeVisible({ timeout: 15_000 });
});
