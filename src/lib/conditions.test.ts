import { describe, expect, it } from "vitest";
import { extractConditions, summarizeStatus } from "./conditions";
import type { K8sResource } from "./types";

function res(status: Record<string, unknown> | undefined): K8sResource {
  return {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "Gateway",
    metadata: { name: "gw", namespace: "default" },
    status,
  };
}

describe("extractConditions", () => {
  it("reads top-level status.conditions", () => {
    const conditions = extractConditions(
      res({ conditions: [{ type: "Accepted", status: "True" }] }),
    );
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toMatchObject({ type: "Accepted", status: "True" });
  });

  it("reads Gateway listener conditions with scope", () => {
    const conditions = extractConditions(
      res({
        conditions: [{ type: "Programmed", status: "True" }],
        listeners: [
          {
            name: "http",
            conditions: [{ type: "ResolvedRefs", status: "False", message: "bad cert" }],
          },
        ],
      }),
    );
    expect(conditions).toHaveLength(2);
    expect(conditions[1]).toMatchObject({
      type: "ResolvedRefs",
      status: "False",
      scope: "listener/http",
    });
  });

  it("reads route parent conditions with scope", () => {
    const conditions = extractConditions(
      res({
        parents: [
          {
            parentRef: { name: "gateway", namespace: "infra" },
            conditions: [{ type: "Accepted", status: "False", message: "no listener" }],
          },
        ],
      }),
    );
    expect(conditions).toHaveLength(1);
    expect(conditions[0].scope).toBe("parent/infra/gateway");
  });

  it("returns empty for missing status", () => {
    expect(extractConditions(res(undefined))).toEqual([]);
  });
});

describe("summarizeStatus", () => {
  it("is Healthy when all positive conditions are True", () => {
    const summary = summarizeStatus(
      res({
        conditions: [
          { type: "Accepted", status: "True" },
          { type: "Programmed", status: "True" },
        ],
      }),
    );
    expect(summary.state).toBe("Healthy");
  });

  it("is Degraded with message when any condition is False", () => {
    const summary = summarizeStatus(
      res({
        parents: [
          {
            parentRef: { name: "gw" },
            conditions: [
              { type: "Accepted", status: "False", message: "no matching listener" },
            ],
          },
        ],
      }),
    );
    expect(summary.state).toBe("Degraded");
    expect(summary.message).toContain("no matching listener");
  });

  it("is Pending when a condition is Unknown and none are False", () => {
    const summary = summarizeStatus(
      res({ conditions: [{ type: "Programmed", status: "Unknown" }] }),
    );
    expect(summary.state).toBe("Pending");
  });

  it("is Unknown with no conditions", () => {
    const summary = summarizeStatus(res({}));
    expect(summary.state).toBe("Unknown");
    expect(summary.message).toBe("No status reported");
  });

  it("treats negative-polarity types correctly (Conflicted=True is bad)", () => {
    const summary = summarizeStatus(
      res({ conditions: [{ type: "Conflicted", status: "True", message: "conflict" }] }),
    );
    expect(summary.state).toBe("Degraded");
  });
});
