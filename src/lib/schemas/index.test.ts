import { describe, expect, it } from "vitest";
import { getBundledSchema } from "./index";

describe("getBundledSchema", () => {
  it("serves every CRD the console manages", () => {
    for (const name of [
      "agentgatewaybackends.agentgateway.dev",
      "agentgatewaypolicies.agentgateway.dev",
      "agentgatewayparameters.agentgateway.dev",
      "gateways.gateway.networking.k8s.io",
      "gatewayclasses.gateway.networking.k8s.io",
      "httproutes.gateway.networking.k8s.io",
      "grpcroutes.gateway.networking.k8s.io",
    ]) {
      const bundle = getBundledSchema(name);
      expect(bundle, name).not.toBeNull();
      expect(Object.keys(bundle!.versions).length, name).toBeGreaterThan(0);
    }
  });

  it("returns null for unknown CRDs", () => {
    expect(getBundledSchema("nope.example.com")).toBeNull();
  });
});
