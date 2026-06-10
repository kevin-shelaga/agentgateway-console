import { beforeEach, describe, expect, it } from "vitest";
import { clearHistory, getHistory, recordSamples } from "./metrics-history";
import type { InfraPod } from "./api-client";

function pod(name: string, cpu?: number, mem?: number): InfraPod {
  return {
    name,
    namespace: "ns",
    role: "proxy",
    phase: "Running",
    ready: "1/1",
    restarts: 0,
    cpuMillis: cpu,
    memoryBytes: mem,
  };
}

describe("metrics history store", () => {
  beforeEach(clearHistory);

  it("accumulates samples per pod across record calls", () => {
    recordSamples([pod("a", 1, 100)], 1000);
    recordSamples([pod("a", 2, 200)], 2000);
    expect(getHistory("ns/a")).toEqual([
      { t: 1000, cpu: 1, mem: 100 },
      { t: 2000, cpu: 2, mem: 200 },
    ]);
  });

  it("ignores pods without usage and duplicate timestamps", () => {
    recordSamples([pod("a")], 1000);
    expect(getHistory("ns/a")).toEqual([]);
    recordSamples([pod("a", 1, 100)], 2000);
    recordSamples([pod("a", 9, 900)], 2000); // same poll tick recorded twice
    expect(getHistory("ns/a")).toHaveLength(1);
  });

  it("caps the series length", () => {
    for (let i = 0; i < 200; i++) recordSamples([pod("a", i, i)], i * 1000);
    const history = getHistory("ns/a");
    expect(history).toHaveLength(120);
    expect(history.at(-1)!.cpu).toBe(199);
  });

  it("returns an empty series for unknown pods", () => {
    expect(getHistory("ns/none")).toEqual([]);
  });
});
