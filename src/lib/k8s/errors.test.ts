import { describe, expect, it } from "vitest";

import { parseK8sError } from "./errors";

const statusBody = {
  kind: "Status",
  code: 422,
  reason: "Invalid",
  message: 'AgentgatewayBackend.agentgateway.dev "x" is invalid',
  details: {
    causes: [
      {
        field: "spec.ai.provider",
        reason: "FieldValueRequired",
        message: "Required value",
      },
    ],
  },
};

describe("parseK8sError", () => {
  it("parses an ApiException with a JSON-string body", () => {
    const err = { code: 422, body: JSON.stringify(statusBody) };

    const parsed = parseK8sError(err);

    expect(parsed.status).toBe(422);
    expect(parsed.reason).toBe("Invalid");
    expect(parsed.message).toBe(
      'AgentgatewayBackend.agentgateway.dev "x" is invalid',
    );
    expect(parsed.causes).toHaveLength(1);
    expect(parsed.causes[0]).toEqual({
      field: "spec.ai.provider",
      reason: "FieldValueRequired",
      message: "Required value",
    });
  });

  it("parses an ApiException whose body is already an object", () => {
    const err = { code: 422, body: statusBody };

    const parsed = parseK8sError(err);

    expect(parsed.status).toBe(422);
    expect(parsed.reason).toBe("Invalid");
    expect(parsed.causes).toHaveLength(1);
    expect(parsed.causes[0].field).toBe("spec.ai.provider");
  });

  it("falls back gracefully on a plain Error", () => {
    const parsed = parseK8sError(new Error("boom"));

    expect(parsed.status).toBe(500);
    expect(parsed.reason).toBe("Unknown");
    expect(parsed.message).toBe("boom");
    expect(parsed.causes).toEqual([]);
  });

  it("uses the exception code when the string body is unparseable", () => {
    const parsed = parseK8sError({ code: 401, body: "Unauthorized" });

    expect(parsed.status).toBe(401);
    expect(parsed.reason).toBe("Unknown");
    expect(parsed.causes).toEqual([]);
  });
});
