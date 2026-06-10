import { describe, expect, it } from "vitest";
import schema from "./schemas/bundled/agentgatewaybackends.agentgateway.dev.json";
import { compileValidator, validateYamlSyntax } from "./validation";

const backendSchema = schema.versions.v1alpha1 as object;

function validBackend() {
  return {
    apiVersion: "agentgateway.dev/v1alpha1",
    kind: "AgentgatewayBackend",
    metadata: { name: "x", namespace: "default" },
    spec: { static: { host: "example.com", port: 443 } },
  };
}

describe("compileValidator", () => {
  it("returns no issues for a valid minimal AgentgatewayBackend", () => {
    const validate = compileValidator(backendSchema);
    expect(validate(validBackend())).toEqual([]);
  });

  it("reports a wrong type with a dot-notation path", () => {
    const validate = compileValidator(backendSchema);
    const doc = validBackend();
    (doc.spec.static as Record<string, unknown>).port = "not-a-number";
    const issues = validate(doc);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.path.includes("spec.static.port"))).toBe(true);
  });

  it("accepts an empty spec (exactly-one-of is enforced via CEL, not openAPI structure)", () => {
    // Verified: the bundled schema's spec has no `required` and no oneOf/anyOf;
    // the "exactly one of" rule lives in x-kubernetes-validations (CEL), which
    // AJV does not evaluate. So spec: {} is structurally valid.
    const validate = compileValidator(backendSchema);
    const doc = validBackend();
    doc.spec = {} as typeof doc.spec;
    expect(validate(doc)).toEqual([]);
  });

  it("is cacheable: compiling twice returns consistent results", () => {
    const a = compileValidator(backendSchema);
    const b = compileValidator(backendSchema);
    expect(a(validBackend())).toEqual([]);
    expect(b(validBackend())).toEqual([]);
    const bad = validBackend();
    (bad.spec.static as Record<string, unknown>).port = "nope";
    expect(b(bad)).toEqual(a(bad));
  });

  it("includes the missing property name for required errors", () => {
    // The schema's only top-level required property is "spec"
    // (metadata is just {type: object} in CRD structural schemas).
    const validate = compileValidator(backendSchema);
    const doc = validBackend() as Record<string, unknown>;
    delete doc.spec;
    const issues = validate(doc);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes("spec"))).toBe(true);
  });
});

describe("validateYamlSyntax", () => {
  it("returns no issues for valid YAML", () => {
    expect(validateYamlSyntax("a: 1\nb:\n  c: two\n")).toEqual([]);
  });

  it("reports syntax errors with line/col in the message", () => {
    const issues = validateYamlSyntax("a: [unclosed");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].path).toBe("");
    expect(issues[0].message).toMatch(/line \d+/i);
  });
});
