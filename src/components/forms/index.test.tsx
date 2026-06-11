import { describe, expect, it } from "vitest";
import { FORMS } from "@/components/forms";
import { getResource, RESOURCES } from "@/lib/registry";

describe("FORMS registry", () => {
  it("has a guided form for all 11 editable OSS registry kinds", () => {
    expect(Object.keys(FORMS).sort()).toEqual([
      "backends",
      "backendtlspolicies",
      "gatewayclasses",
      "gateways",
      "grpcroutes",
      "httproutes",
      "listenersets",
      "parameters",
      "policies",
      "referencegrants",
      "tlsroutes",
    ]);
  });

  it("every FORMS key maps to an editable registry descriptor", () => {
    for (const id of Object.keys(FORMS)) {
      const desc = getResource(id);
      expect(desc, `registry entry for ${id}`).toBeDefined();
      expect(desc!.readOnly, `${id} must be editable`).not.toBe(true);
    }
  });

  it("every editable registry kind has a form (none fall back to YAML-only)", () => {
    for (const desc of RESOURCES) {
      expect(FORMS[desc.id], `form for ${desc.id}`).toBeDefined();
    }
  });

  it("every entry is a renderable component", () => {
    for (const [id, Form] of Object.entries(FORMS)) {
      expect(typeof Form === "function" || typeof Form === "object", id).toBe(true);
    }
  });
});
