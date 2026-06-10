# Open Source Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub PR checks, Playwright e2e coverage, trusted kind-cluster integration e2e, GHCR image publishing, and npm release publishing for `npx agentgateway-console`.

**Architecture:** Keep automation split by responsibility and trust boundary: PR CI is credential-free and safe for forks; kind-backed e2e runs only for trusted repository branches; container and npm publishing run only from trusted branch/tag/release contexts. Playwright owns browser tests with separate `smoke` and `kind` projects, while GitHub Actions orchestrates install/build/test/publish workflows.

**Tech Stack:** GitHub Actions, Node.js 22, npm, Vitest, Playwright, Docker Buildx, GitHub Container Registry, kind via `helm/kind-action`, Kubernetes CRDs generated from the repo's bundled schema JSON.

**Reference docs checked:** Playwright config supports `webServer`, named projects, GitHub reporter, and `--project=<name>` runs. GitHub's current package examples use `actions/checkout@v6` and `actions/setup-node@v4`. Docker's current examples use `docker/metadata-action@v6`, `docker/build-push-action@v7`, and `docker/login-action@v4`. `helm/kind-action@v1` is the documented kind setup action.

---

### Task 1: Package Metadata and Scripts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Inspect current package metadata**

Run:

```bash
npm pkg get name version private scripts bin license
```

Expected: package is named `agc-scaffold`, `private` is `true`, and only `dev`, `build`, `start`, and `test` scripts exist.

- [ ] **Step 2: Install Playwright test dependency**

Run:

```bash
npm install --save-dev @playwright/test
```

Expected: `package.json` gains `@playwright/test` in `devDependencies`, and `package-lock.json` updates.

- [ ] **Step 3: Update package metadata and scripts**

Modify `package.json` to include these exact fields while preserving existing dependencies and the existing `bin` entry:

```json
{
  "name": "agentgateway-console",
  "version": "0.1.0",
  "private": false,
  "description": "Kubernetes console for agentgateway — dashboards and validated clickops for Gateway API and agentgateway.dev CRDs",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/kevin-shelaga/agentgateway-console.git"
  },
  "bugs": {
    "url": "https://github.com/kevin-shelaga/agentgateway-console/issues"
  },
  "homepage": "https://github.com/kevin-shelaga/agentgateway-console#readme",
  "engines": {
    "node": ">=20"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "files": [
    "bin/",
    "src/",
    "public/",
    "components.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test --project=smoke",
    "test:e2e:kind": "playwright test --project=kind",
    "test:e2e:ui": "playwright test --ui",
    "check": "npm run test:coverage && npm run build && npm run test:e2e"
  }
}
```

- [ ] **Step 4: Verify package metadata**

Run:

```bash
npm pkg get name private repository.url bugs.url homepage engines.node publishConfig.access files scripts.check
```

Expected: values match the metadata from Step 3.

- [ ] **Step 5: Verify package contents**

Run:

```bash
npm pack --dry-run
```

Expected: output includes `bin/agentgateway-console.mjs`, `src/app/page.tsx`, `src/lib/schemas/bundled/agentgatewaybackends.agentgateway.dev.json`, `public/banner-dark.svg`, `next.config.ts`, `README.md`, and `LICENSE`. Output must not include `.git`, `.next`, `node_modules`, or `docs/superpowers`.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json package-lock.json
git commit -m "chore: prepare package metadata for releases"
```

Expected: commit succeeds with only package metadata and lockfile changes.

### Task 2: Playwright Smoke E2E

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`

- [ ] **Step 1: Write smoke e2e tests before config**

Create `e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

async function mockConnectedCluster(page) {
  await page.route("**/api/cluster", (route) =>
    route.fulfill({ json: { connected: true, context: "smoke" } }),
  );
  await page.route("**/api/contexts", (route) =>
    route.fulfill({ json: { contexts: ["smoke"], current: "smoke", inCluster: false } }),
  );
  await page.route("**/api/infra", (route) =>
    route.fulfill({ json: { metricsAvailable: false, pods: [] } }),
  );
  await page.route("**/api/resources/**", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
}

async function mockUnreachableCluster(page) {
  await page.route("**/api/cluster", (route) =>
    route.fulfill({
      json: { connected: false, context: null, error: "No kubeconfig found" },
    }),
  );
  await page.route("**/api/contexts", (route) =>
    route.fulfill({ json: { contexts: [], current: "", inCluster: false } }),
  );
  await page.route("**/api/infra", (route) =>
    route.fulfill({ json: { metricsAvailable: false, pods: [] } }),
  );
  await page.route("**/api/resources/**", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
}

test("renders the dashboard shell with empty API responses", async ({ page }) => {
  await mockConnectedCluster(page);

  await page.goto("/");

  await expect(page.getByRole("link", { name: /agentgateway console/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("navigates to a resource list route", async ({ page }) => {
  await mockConnectedCluster(page);

  await page.goto("/");

  await page.getByRole("link", { name: "Gateways" }).click();

  await expect(page).toHaveURL(/\/resources\/gateways$/);
  await expect(page.getByRole("heading", { name: "Gateways" })).toBeVisible();
});

test("shows the cluster-unreachable state without crashing", async ({ page }) => {
  await mockUnreachableCluster(page);

  await page.goto("/");

  await expect(page.getByText("Cluster unreachable")).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 2: Run smoke test and verify RED**

Run:

```bash
npm run test:e2e
```

Expected: FAIL because the `smoke` Playwright project is not defined yet.

- [ ] **Step 3: Add Playwright configuration**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `PORT=${port} HOSTNAME=127.0.0.1 npm run start`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "smoke",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "kind",
      testMatch: /kind\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 4: Build before running Playwright**

Run:

```bash
npm run build
```

Expected: PASS. Playwright uses `npm run start`, so the production build must exist first.

- [ ] **Step 5: Run smoke e2e and verify GREEN**

Run:

```bash
npm run test:e2e
```

Expected: PASS for all tests in `e2e/smoke.spec.ts`.

- [ ] **Step 6: Commit**

Run:

```bash
git add playwright.config.ts e2e/smoke.spec.ts
git commit -m "test: add playwright smoke e2e"
```

Expected: commit succeeds with only Playwright config and smoke tests.

### Task 3: CRD Rendering Script for Kind

**Files:**
- Create: `scripts/ci/render-crds.mjs`

- [ ] **Step 1: Create the CRD rendering script**

Create `scripts/ci/render-crds.mjs`:

```js
#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const bundledDir = path.join(repoRoot, "src/lib/schemas/bundled");

const REQUIRED = [
  "agentgatewaybackends.agentgateway.dev",
  "agentgatewaypolicies.agentgateway.dev",
  "agentgatewayparameters.agentgateway.dev",
  "gatewayclasses.gateway.networking.k8s.io",
  "gateways.gateway.networking.k8s.io",
  "httproutes.gateway.networking.k8s.io",
  "grpcroutes.gateway.networking.k8s.io",
];

function singular(plural) {
  if (plural === "policies") return "policy";
  if (plural.endsWith("classes")) return plural.slice(0, -2);
  if (plural.endsWith("ies")) return `${plural.slice(0, -3)}y`;
  if (plural.endsWith("s")) return plural.slice(0, -1);
  return plural;
}

function bundleToCrd(bundle) {
  return {
    apiVersion: "apiextensions.k8s.io/v1",
    kind: "CustomResourceDefinition",
    metadata: { name: bundle.name },
    spec: {
      group: bundle.group,
      names: {
        plural: bundle.plural,
        singular: singular(bundle.plural),
        kind: bundle.kind,
        listKind: `${bundle.kind}List`,
      },
      scope: bundle.scope,
      versions: Object.entries(bundle.versions).map(([name, schema], index) => ({
        name,
        served: true,
        storage: index === 0,
        schema: { openAPIV3Schema: schema },
      })),
    },
  };
}

async function main() {
  const entries = (await readdir(bundledDir)).filter((entry) => entry.endsWith(".json")).sort();
  const bundles = [];
  for (const entry of entries) {
    const bundle = JSON.parse(await readFile(path.join(bundledDir, entry), "utf8"));
    if (REQUIRED.includes(bundle.name)) bundles.push(bundle);
  }

  const names = bundles.map((bundle) => bundle.name);
  const missing = REQUIRED.filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw new Error(`Missing required bundled schemas: ${missing.join(", ")}`);
  }

  const manifest = bundles.map(bundleToCrd).map((doc) => YAML.stringify(doc)).join("---\n");
  if (process.argv.includes("--apply")) {
    const result = spawnSync("kubectl", ["apply", "-f", "-"], {
      input: manifest,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    });
    process.exit(result.status ?? 1);
  }

  process.stdout.write(manifest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify rendered CRDs are valid YAML**

Run:

```bash
node scripts/ci/render-crds.mjs
```

Expected: stdout contains seven `CustomResourceDefinition` documents, including `agentgatewaybackends.agentgateway.dev` and `gateways.gateway.networking.k8s.io`.

- [ ] **Step 3: Verify kubectl client-side parsing**

Run:

```bash
node scripts/ci/render-crds.mjs | kubectl apply --dry-run=client -f -
```

Expected: PASS if `kubectl` is available locally. If `kubectl` is not installed, record that local verification is skipped and rely on Task 5 CI verification after kind is available.

- [ ] **Step 4: Commit**

Run:

```bash
git add scripts/ci/render-crds.mjs
git commit -m "test: render bundled crds for kind e2e"
```

Expected: commit succeeds with only the CRD rendering script.

### Task 4: Kind-Backed Playwright E2E

**Files:**
- Create: `e2e/kind.spec.ts`

- [ ] **Step 1: Write kind e2e tests**

Create `e2e/kind.spec.ts`:

```ts
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
  expect(body.error.message).toContain("Gateway");

  const list = await request.get("/api/resources/gateway.networking.k8s.io/v1/gateways?namespace=default");
  expect(list.ok()).toBeTruthy();
  const listBody = await list.json();
  expect(listBody.items).toEqual([]);
});
```

- [ ] **Step 2: Run kind tests and verify RED without a cluster**

Run:

```bash
npm run test:e2e:kind
```

Expected: FAIL locally unless a kind cluster with the rendered CRDs is active. Failure should come from `/api/cluster` reporting `connected: false` or schema source being `bundled`, not from TypeScript syntax errors.

- [ ] **Step 3: Verify GREEN with a local kind cluster**

Run:

```bash
kind create cluster --name agc-e2e
node scripts/ci/render-crds.mjs --apply
npm run build
npm run test:e2e:kind
kind delete cluster --name agc-e2e
```

Expected: PASS for all tests in `e2e/kind.spec.ts`. If `kind` is not installed locally, record that local kind verification is skipped and rely on Task 5 GitHub Actions verification.

- [ ] **Step 4: Commit**

Run:

```bash
git add e2e/kind.spec.ts
git commit -m "test: add kind-backed e2e coverage"
```

Expected: commit succeeds with only kind e2e tests.

### Task 5: GitHub Actions PR and Kind E2E Workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/kind-e2e.yml`

- [ ] **Step 1: Add PR CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run unit and component tests with coverage
        run: npm run test:coverage

      - name: Build production app
        run: npm run build

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Run smoke e2e
        run: npm run test:e2e

      - name: Build Docker image
        run: docker build -t agentgateway-console:ci .
```

- [ ] **Step 2: Add kind e2e workflow**

Create `.github/workflows/kind-e2e.yml`:

```yaml
name: Kind E2E

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  kind-e2e:
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Create kind cluster
        uses: helm/kind-action@v1
        with:
          cluster_name: agc-e2e

      - name: Install bundled CRDs
        run: node scripts/ci/render-crds.mjs --apply

      - name: Verify CRDs
        run: |
          kubectl get crd gateways.gateway.networking.k8s.io
          kubectl get crd agentgatewaybackends.agentgateway.dev

      - name: Build production app
        run: npm run build

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Run kind e2e
        run: npm run test:e2e:kind
```

- [ ] **Step 3: Validate workflow YAML parses**

Run:

```bash
npx prettier --check .github/workflows/ci.yml .github/workflows/kind-e2e.yml
```

Expected: PASS if Prettier is available through `npx`; if the command downloads Prettier and network is unavailable, skip this step and use `ruby -e "require 'yaml'; ARGV.each { |f| YAML.load_file(f) }" .github/workflows/ci.yml .github/workflows/kind-e2e.yml` instead.

- [ ] **Step 4: Commit**

Run:

```bash
git add .github/workflows/ci.yml .github/workflows/kind-e2e.yml
git commit -m "ci: add pr checks and kind e2e"
```

Expected: commit succeeds with only CI workflow files.

### Task 6: GHCR Container Publishing Workflow

**Files:**
- Create: `.github/workflows/container.yml`

- [ ] **Step 1: Add container publish workflow**

Create `.github/workflows/container.yml`:

```yaml
name: Container

on:
  push:
    branches: [main]
    tags: ["v*.*.*"]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

env:
  IMAGE_NAME: ghcr.io/kevin-shelaga/agentgateway-console

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Login to GHCR
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.IMAGE_NAME }}
          flavor: latest=false
          tags: |
            type=ref,event=branch
            type=ref,event=tag
            type=sha,prefix=sha-
            type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}

      - name: Build and push image
        uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [ ] **Step 2: Validate workflow YAML parses**

Run:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/container.yml')"
```

Expected: PASS with no output.

- [ ] **Step 3: Commit**

Run:

```bash
git add .github/workflows/container.yml
git commit -m "ci: publish container images to ghcr"
```

Expected: commit succeeds with only the container workflow.

### Task 7: npm Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Add npm release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  release:
    types: [published]
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  npm:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Verify package version matches tag
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          node -e "const p=require('./package.json'); const tag=process.env.GITHUB_REF_NAME.replace(/^v/, ''); if (p.version !== tag) { throw new Error(`package.json version ${p.version} does not match tag ${process.env.GITHUB_REF_NAME}`) }"

      - name: Run tests
        run: npm test

      - name: Build production app
        run: npm run build

      - name: Verify package contents
        run: npm pack --dry-run

      - name: Check whether version already exists
        id: published
        run: |
          VERSION="$(node -p "require('./package.json').version")"
          if npm view "agentgateway-console@$VERSION" version >/dev/null 2>&1; then
            echo "exists=true" >> "$GITHUB_OUTPUT"
          else
            echo "exists=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Publish to npm
        if: steps.published.outputs.exists == 'false'
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Validate workflow YAML parses**

Run:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release.yml')"
```

Expected: PASS with no output.

- [ ] **Step 3: Verify package dry-run locally**

Run:

```bash
npm pack --dry-run
```

Expected: PASS and package contents match Task 1 Step 5.

- [ ] **Step 4: Commit**

Run:

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish npm releases"
```

Expected: commit succeeds with only the release workflow.

### Task 8: README Open Source Automation Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add badges near existing badges**

Add these badges below the existing license/framework badges:

```markdown
[![CI](https://github.com/kevin-shelaga/agentgateway-console/actions/workflows/ci.yml/badge.svg)](https://github.com/kevin-shelaga/agentgateway-console/actions/workflows/ci.yml)
[![Kind E2E](https://github.com/kevin-shelaga/agentgateway-console/actions/workflows/kind-e2e.yml/badge.svg)](https://github.com/kevin-shelaga/agentgateway-console/actions/workflows/kind-e2e.yml)
[![Container](https://github.com/kevin-shelaga/agentgateway-console/actions/workflows/container.yml/badge.svg)](https://github.com/kevin-shelaga/agentgateway-console/actions/workflows/container.yml)
```

- [ ] **Step 2: Update Docker section with GHCR image**

Add this before the local `docker build` example:

````markdown
Published images are available from GitHub Container Registry:

```bash
docker run -p 3000:3000 -v ~/.kube:/home/agc/.kube:ro ghcr.io/kevin-shelaga/agentgateway-console:latest
```
````

- [ ] **Step 3: Add release process section**

Add a `## Releasing` section near the development docs:

````markdown
## Releasing

Releases publish two artifacts:

- `ghcr.io/kevin-shelaga/agentgateway-console` for container deployments.
- `agentgateway-console` on npm for `npx agentgateway-console`.

Release flow:

```bash
npm version patch
git push origin main --tags
```

Publishing is handled by GitHub Actions. The container workflow tags semver releases as `vX.Y.Z` and `latest`; npm publishing runs from trusted release/tag contexts and requires the repository `NPM_TOKEN` secret.
````

- [ ] **Step 4: Verify README links**

Run:

```bash
rg -n "actions/workflows|ghcr.io/kevin-shelaga/agentgateway-console|npm version patch|NPM_TOKEN" README.md
```

Expected: all new badge, container, and release-process references are present.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md
git commit -m "docs: document ci and release automation"
```

Expected: commit succeeds with only README changes.

### Task 9: Full Local Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run Vitest coverage**

Run:

```bash
npm run test:coverage
```

Expected: PASS with configured coverage thresholds.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Install Playwright browser if needed**

Run:

```bash
npx playwright install chromium
```

Expected: Chromium browser is installed or already present.

- [ ] **Step 4: Run smoke e2e**

Run:

```bash
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 5: Build Docker image locally**

Run:

```bash
docker build -t agentgateway-console:ci .
```

Expected: PASS.

- [ ] **Step 6: Run kind e2e when kind is available**

Run:

```bash
kind create cluster --name agc-e2e
node scripts/ci/render-crds.mjs --apply
npm run test:e2e:kind
kind delete cluster --name agc-e2e
```

Expected: PASS. If `kind` or Docker is unavailable locally, record the skipped local kind verification and rely on `.github/workflows/kind-e2e.yml` after pushing to GitHub.

- [ ] **Step 7: Run package dry-run**

Run:

```bash
npm pack --dry-run
```

Expected: PASS and package contents remain scoped to published runtime/source files.

## Self-review

- Spec coverage: PR checks are covered by Task 5; smoke e2e by Task 2; kind e2e by Tasks 3, 4, and 5; GHCR publishing by Task 6; npm release publishing by Tasks 1 and 7; README publishing docs by Task 8; final verification by Task 9.
- Placeholder scan: no unfinished markers or open-ended implementation placeholders remain.
- Type and name consistency: scripts use `test:e2e`, `test:e2e:kind`, and Playwright project names `smoke` and `kind` consistently; image name is consistently `ghcr.io/kevin-shelaga/agentgateway-console`; npm package name is consistently `agentgateway-console`.
