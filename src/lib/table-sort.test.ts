import { describe, expect, it } from "vitest";
import {
  applyColumnFilters,
  columnFacets,
  columnText,
  sortResources,
  type SortState,
} from "./table-sort";
import { getResource } from "./registry";
import type { K8sResource } from "./types";

const desc = getResource("gateways")!;

function gw(name: string, opts: { ns?: string; created?: string; class?: string; degraded?: boolean } = {}): K8sResource {
  return {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "Gateway",
    metadata: {
      name,
      namespace: opts.ns ?? "default",
      creationTimestamp: opts.created ?? "2026-01-01T00:00:00Z",
    },
    spec: { gatewayClassName: opts.class ?? "agentgateway", listeners: [] },
    status: {
      conditions: [
        { type: "Programmed", status: opts.degraded ? "False" : "True", message: "m" },
      ],
    },
  };
}

const items = [
  gw("charlie", { created: "2026-03-01T00:00:00Z", class: "zeta" }),
  gw("alpha", { created: "2026-01-01T00:00:00Z", class: "agentgateway", degraded: true }),
  gw("bravo", { created: "2026-02-01T00:00:00Z", class: "agentgateway" }),
];

function names(sorted: K8sResource[]): string[] {
  return sorted.map((r) => r.metadata.name);
}

describe("sortResources", () => {
  it("sorts by name in both directions", () => {
    const asc: SortState = { key: "name", direction: "asc" };
    expect(names(sortResources(items, desc, asc))).toEqual(["alpha", "bravo", "charlie"]);
    expect(names(sortResources(items, desc, { key: "name", direction: "desc" }))).toEqual([
      "charlie",
      "bravo",
      "alpha",
    ]);
  });

  it("sorts by age (creationTimestamp), newest first when desc", () => {
    expect(
      names(sortResources(items, desc, { key: "age", direction: "desc" })),
    ).toEqual(["charlie", "bravo", "alpha"]);
  });

  it("sorts by status severity (worst first when asc)", () => {
    expect(names(sortResources(items, desc, { key: "status", direction: "asc" }))[0]).toBe("alpha");
  });

  it("sorts by a kind-specific column accessor", () => {
    expect(
      names(sortResources(items, desc, { key: "class", direction: "desc" }))[0],
    ).toBe("charlie"); // class zeta
  });

  it("returns the original order when no sort is active", () => {
    expect(names(sortResources(items, desc, null))).toEqual(["charlie", "alpha", "bravo"]);
  });

  it("compares numerically when values are numeric strings", () => {
    const a = gw("a");
    const b = gw("b");
    const fake = {
      ...desc,
      listColumns: [
        { id: "rules", header: "Rules", accessor: (r: K8sResource) => (r.metadata.name === "a" ? "10" : "9") },
      ],
    };
    expect(
      names(sortResources([a, b], fake, { key: "rules", direction: "asc" })),
    ).toEqual(["b", "a"]); // 9 < 10 — not lexicographic
  });
});

describe("columnFacets / applyColumnFilters", () => {
  it("collects distinct values with counts", () => {
    const facets = columnFacets(items, desc.listColumns[0]); // class column
    expect(facets).toEqual([
      { value: "agentgateway", count: 2 },
      { value: "zeta", count: 1 },
    ]);
  });

  it("filters rows by selected values, multi-column AND / in-column OR", () => {
    const filtered = applyColumnFilters(items, desc, { class: new Set(["agentgateway"]) });
    expect(names(filtered).sort()).toEqual(["alpha", "bravo"]);
    expect(applyColumnFilters(items, desc, {})).toHaveLength(3);
  });

  it("filters by status state", () => {
    const filtered = applyColumnFilters(items, desc, { __status: new Set(["Degraded"]) });
    expect(names(filtered)).toEqual(["alpha"]);
  });
});

describe("columnText", () => {
  it("normalizes arrays and missing values", () => {
    expect(columnText(["HTTP:80", "HTTPS:443"])).toBe("HTTP:80, HTTPS:443");
    expect(columnText(undefined)).toBe("");
    expect(columnText("x")).toBe("x");
  });
});
