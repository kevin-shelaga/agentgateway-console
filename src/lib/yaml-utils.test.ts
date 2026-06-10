import { describe, expect, it } from "vitest";
import { parseYamlResource, toDisplayYaml, toEditableResource, toEditableYaml } from "./yaml-utils";
import type { K8sResource } from "./types";

const res: K8sResource = {
  apiVersion: "v1",
  kind: "Gateway",
  metadata: {
    name: "gw",
    namespace: "ns",
    uid: "abc",
    generation: 3,
    creationTimestamp: "2026-01-01T00:00:00Z",
    resourceVersion: "42",
    annotations: {
      "kubectl.kubernetes.io/last-applied-configuration": "{...}",
      keep: "me",
    },
  },
  spec: { gatewayClassName: "agentgateway" },
  status: { conditions: [] },
};
(res.metadata as unknown as Record<string, unknown>).managedFields = [{ manager: "kubectl" }];

describe("toDisplayYaml", () => {
  it("hides managedFields and last-applied, keeps the rest", () => {
    const yaml = toDisplayYaml(res);
    expect(yaml).not.toContain("managedFields");
    expect(yaml).not.toContain("last-applied-configuration");
    expect(yaml).toContain("keep: me");
    expect(yaml).toContain("status:");
  });
  it("does not mutate the input", () => {
    toDisplayYaml(res);
    expect((res.metadata as unknown as Record<string, unknown>).managedFields).toBeDefined();
  });
});

describe("toEditableResource / toEditableYaml", () => {
  it("strips status and server-managed metadata but keeps resourceVersion", () => {
    const editable = toEditableResource(res);
    expect(editable.status).toBeUndefined();
    expect(editable.metadata.uid).toBeUndefined();
    expect(editable.metadata.generation).toBeUndefined();
    expect(editable.metadata.creationTimestamp).toBeUndefined();
    expect(editable.metadata.resourceVersion).toBe("42");
    expect(toEditableYaml(res)).toContain("resourceVersion");
  });
  it("drops the annotations map entirely when only last-applied remains", () => {
    const only = JSON.parse(JSON.stringify(res)) as K8sResource;
    only.metadata.annotations = {
      "kubectl.kubernetes.io/last-applied-configuration": "{...}",
    };
    expect(toEditableResource(only).metadata.annotations).toBeUndefined();
  });
});

describe("parseYamlResource", () => {
  it("round-trips", () => {
    const parsed = parseYamlResource(toEditableYaml(res));
    expect(parsed.kind).toBe("Gateway");
    expect(parsed.metadata.name).toBe("gw");
  });
});
