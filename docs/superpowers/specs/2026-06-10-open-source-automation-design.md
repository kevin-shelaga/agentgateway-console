# agentgateway-console Open Source Automation Design

**Date:** 2026-06-10
**Status:** Approved for design; pending implementation plan review

## Purpose

Prepare `agentgateway-console` to operate as an open-source GitHub project at
`https://github.com/kevin-shelaga/agentgateway-console.git`.

The automation must give contributors reliable pull request checks, give users a
published container image at GitHub Container Registry, and make the CLI launcher
usable through `npx agentgateway-console`.

## Repository Assumptions

- Default branch: `main`
- Container image: `ghcr.io/kevin-shelaga/agentgateway-console`
- npm package: public `agentgateway-console`
- License: Apache-2.0
- Runtime app: Next.js 16 standalone output served by the existing Dockerfile and
  CLI launcher
- Unit/component tests: Vitest
- End-to-end tests: Playwright

If the unscoped npm name `agentgateway-console` is unavailable, the implementation
will switch to `@kevin-shelaga/agentgateway-console` and update the README examples
accordingly.

## Workflow Architecture

Use three focused GitHub Actions workflows instead of one large workflow.

### Pull Request Checks

`.github/workflows/ci.yml`

Triggers:

- `pull_request`
- `push` to `main`

Checks:

1. Install dependencies with `npm ci`.
2. Run TypeScript-aware production build with `npm run build`.
3. Run Vitest with coverage thresholds.
4. Run Playwright end-to-end smoke tests.
5. Build the Docker image locally as a packaging smoke test, without pushing.

The PR workflow must not require secrets. This keeps forked PRs testable and avoids
exposing publish credentials to untrusted code.

### Container Publishing

`.github/workflows/container.yml`

Triggers:

- `push` to `main`
- Semver tags matching `v*.*.*`
- Manual `workflow_dispatch`

Behavior:

- Builds the existing Dockerfile with Docker Buildx.
- Publishes to GitHub Container Registry using `GITHUB_TOKEN` and package write
  permissions.
- Tags images as:
  - `main` for pushes to `main`
  - `sha-<short-sha>` for all trusted builds
  - `vX.Y.Z` for semver tags
  - `latest` only for semver tags

This avoids treating every `main` commit as a stable release while still making a
moving development image available.

### npm and GitHub Releases

`.github/workflows/release.yml`

Triggers:

- GitHub Release published events
- Semver tags matching `v*.*.*`
- Manual `workflow_dispatch` for recovery

Behavior:

- Verifies the package with `npm ci`, `npm test`, and `npm run build`.
- Runs `npm pack --dry-run` to verify the published package contains the CLI,
  Next app source required for build-on-first-run behavior, public assets, and
  package metadata.
- Publishes to npm with provenance using `NPM_TOKEN`.
- Creates or updates release artifacts only from trusted tag/release contexts.

The package will be made publishable by changing `private` to `false`, adding
repository metadata, declaring Node engine support, and constraining published
files with a `files` list.

## End-to-End Testing

Add Playwright for browser-level smoke coverage.

The first suite should be intentionally small:

- The app boots successfully.
- The dashboard shell renders.
- Navigation to at least one resource list route works.
- The no-cluster or cluster-unreachable state renders without crashing.

The e2e suite should not require a live Kubernetes cluster. Public CI needs stable,
credential-free tests; Kubernetes integration testing can be added later as a
separate trusted workflow if needed.

## Package Scripts

Add scripts that make local and CI behavior obvious:

- `test:coverage` runs Vitest with coverage thresholds.
- `test:e2e` runs Playwright.
- `test:e2e:ui` opens Playwright UI locally.
- `check` runs the aggregate checks expected for PR readiness.

Keep `npm test` as the fast Vitest command so existing developer habits continue
to work.

## README Updates

Add open-source project badges and publishing instructions:

- GitHub Actions CI badge.
- GHCR image reference and example `docker run`.
- `npx agentgateway-console` install/run path.
- Release process summary: tag `vX.Y.Z`, publish GitHub Release, npm and GHCR
  automation runs.

## Secrets and Permissions

Required repository configuration:

- GitHub Actions enabled.
- Workflow permissions allow package writes for the container workflow.
- `NPM_TOKEN` repository secret for npm publishing.

No secrets are required for PR checks.

## Out of Scope

- Full Kubernetes integration tests against a real cluster.
- Automated semantic version selection.
- Changesets or semantic-release.
- Signing container images with cosign.
- Branch protection setup through the GitHub API.

Those can be added once the baseline open-source release loop is working.

## Risks and Mitigations

- **npm name collision:** switch to scoped package if the unscoped name is taken.
- **Package too large:** use `npm pack --dry-run` in CI and a narrow `files` list.
- **Fork PR secret exposure:** never run publish workflows on `pull_request`.
- **Accidental `latest` image drift:** only tag `latest` from semver release tags.
- **E2E flakiness:** keep the first Playwright suite credential-free and focused
  on boot/navigation/error-state behavior.
