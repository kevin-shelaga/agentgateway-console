import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const REQUIRED_CRDS = [
  "agentgatewaybackends.agentgateway.dev",
  "agentgatewaypolicies.agentgateway.dev",
  "agentgatewayparameters.agentgateway.dev",
  "gatewayclasses.gateway.networking.k8s.io",
  "gateways.gateway.networking.k8s.io",
  "httproutes.gateway.networking.k8s.io",
  "grpcroutes.gateway.networking.k8s.io",
];

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  const context = execFileSync("kubectl", ["config", "current-context"], { encoding: "utf8" }).trim();
  if (!context.startsWith("kind-")) {
    throw new Error(`kind e2e requires a kind kube context, got ${context}`);
  }

  // kind puts no kind-specific label on node objects; its nodes are named
  // <cluster>-control-plane / <cluster>-worker, with the cluster name taken
  // from the kind-<cluster> context validated above.
  const clusterName = context.replace(/^kind-/, "");
  const nodes = execFileSync("kubectl", ["get", "nodes", "-o", "name"], {
    encoding: "utf8",
  }).trim();
  const kindNodes = nodes.split("\n").filter((node) => node.includes(clusterName));
  if (kindNodes.length === 0) {
    throw new Error(
      `kind e2e requires nodes for cluster ${clusterName} in context ${context}; found: ${nodes || "none"}`,
    );
  }

  execFileSync("node", ["scripts/ci/render-crds.mjs", "--apply"], { stdio: "inherit" });
  for (const crd of REQUIRED_CRDS) {
    execFileSync("kubectl", ["wait", "--for=condition=Established", `crd/${crd}`, "--timeout=60s"], {
      stdio: "inherit",
    });
  }
});

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

test("server-side dry-run rejects an invalid Gateway without persisting it", async ({ request }, testInfo) => {
  const name = `invalid-gateway-${testInfo.workerIndex}-${Date.now()}`;

  const response = await request.post("/api/dry-run", {
    data: {
      mode: "create",
      manifest: {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: { name, namespace: "default" },
        spec: {},
      },
    },
  });

  expect(response.ok()).toBeFalsy();
  const body = await response.json();
  const errorMessage = String(body.error.message ?? body.error.reason ?? "");

  expect(body.error.status).toBeGreaterThanOrEqual(400);
  expect(errorMessage.length).toBeGreaterThan(0);

  const list = await request.get("/api/resources/gateway.networking.k8s.io/v1/gateways?namespace=default");
  expect(list.ok()).toBeTruthy();
  const listBody = await list.json();
  expect((listBody.items ?? []).some((item: { metadata?: { name?: string } }) => item.metadata?.name === name)).toBe(false);
});
