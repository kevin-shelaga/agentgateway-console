import { describe, expect, it } from "vitest";
import { resolveContext } from "./client";

describe("resolveContext", () => {
  it("ignores the requested context when in-cluster (isolation hard-lock)", () => {
    expect(resolveContext("other-cluster", { inCluster: true })).toBeUndefined();
    expect(
      resolveContext("other-cluster", { inCluster: true, defaultContext: "x" }),
    ).toBeUndefined();
  });

  it("prefers the explicitly requested context locally", () => {
    expect(
      resolveContext("from-header", { inCluster: false, defaultContext: "from-cli" }),
    ).toBe("from-header");
  });

  it("falls back to the CLI default context locally", () => {
    expect(resolveContext(undefined, { inCluster: false, defaultContext: "from-cli" })).toBe(
      "from-cli",
    );
  });

  it("returns undefined (kubeconfig current-context) when nothing is set", () => {
    expect(resolveContext(undefined, { inCluster: false })).toBeUndefined();
  });
});
