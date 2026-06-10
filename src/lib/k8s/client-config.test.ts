import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getApiextensionsClient,
  getCoreClient,
  getKubeConfig,
  getObjectClient,
  isInCluster,
  listContexts,
} from "./client";

const KUBECONFIG = `
apiVersion: v1
kind: Config
clusters:
  - name: alpha
    cluster: { server: "https://alpha.example:6443" }
  - name: beta
    cluster: { server: "https://beta.example:6443" }
users:
  - name: u
    user: { token: "t" }
contexts:
  - name: alpha
    context: { cluster: alpha, user: u }
  - name: beta
    context: { cluster: beta, user: u }
current-context: alpha
`;

function withTempKubeconfig() {
  const dir = mkdtempSync(path.join(tmpdir(), "agc-kc-"));
  const file = path.join(dir, "config");
  writeFileSync(file, KUBECONFIG);
  vi.stubEnv("KUBECONFIG", file);
  vi.stubEnv("KUBERNETES_SERVICE_HOST", "");
  vi.stubEnv("AGC_IN_CLUSTER", "");
  vi.stubEnv("AGC_CONTEXT", "");
}

afterEach(() => vi.unstubAllEnvs());

describe("getKubeConfig (local)", () => {
  it("uses the kubeconfig current-context by default", () => {
    withTempKubeconfig();
    expect(getKubeConfig().getCurrentContext()).toBe("alpha");
  });

  it("switches to an explicitly requested context", () => {
    withTempKubeconfig();
    expect(getKubeConfig("beta").getCurrentContext()).toBe("beta");
  });

  it("falls back to AGC_CONTEXT (CLI --context)", () => {
    withTempKubeconfig();
    vi.stubEnv("AGC_CONTEXT", "beta");
    expect(getKubeConfig().getCurrentContext()).toBe("beta");
  });

  it("throws on unknown contexts", () => {
    withTempKubeconfig();
    expect(() => getKubeConfig("gamma")).toThrow(/unknown context: gamma/);
  });
});

describe("client factories", () => {
  it("constructs typed clients from the kubeconfig", () => {
    withTempKubeconfig();
    expect(getObjectClient("beta")).toBeTruthy();
    expect(getCoreClient()).toBeTruthy();
    expect(getApiextensionsClient()).toBeTruthy();
  });
});

describe("in-cluster detection and isolation", () => {
  it("detects in-cluster via env", () => {
    withTempKubeconfig();
    expect(isInCluster()).toBe(false);
    vi.stubEnv("AGC_IN_CLUSTER", "true");
    expect(isInCluster()).toBe(true);
  });

  it("listContexts reports a single locked in-cluster identity", () => {
    withTempKubeconfig();
    vi.stubEnv("AGC_IN_CLUSTER", "true");
    expect(listContexts()).toEqual({ contexts: [], current: "in-cluster", inCluster: true });
  });

  it("listContexts lists kubeconfig contexts locally", () => {
    withTempKubeconfig();
    expect(listContexts()).toEqual({
      contexts: ["alpha", "beta"],
      current: "alpha",
      inCluster: false,
    });
  });
});
