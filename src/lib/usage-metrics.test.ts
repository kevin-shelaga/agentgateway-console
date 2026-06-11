import { beforeEach, describe, expect, it } from "vitest";
import {
  clearUsageHistory,
  computeRates,
  groupBy,
  recordScrape,
  usageSeries,
} from "./usage-metrics";
import type { PromSample } from "./prom-parse";

function sample(name: string, labels: Record<string, string>, value: number): PromSample {
  return { name, labels, value };
}

describe("rate computation across polls", () => {
  beforeEach(clearUsageHistory);

  it("computes per-second rates from successive counter scrapes", () => {
    recordScrape([sample("agentgateway_requests_total", { gateway: "g" }, 100)], 0);
    recordScrape([sample("agentgateway_requests_total", { gateway: "g" }, 160)], 30_000);
    const rates = computeRates("agentgateway_requests_total");
    expect(rates).toHaveLength(1);
    expect(rates[0].perSecond).toBeCloseTo(2); // 60 over 30s
    expect(rates[0].labels.gateway).toBe("g");
  });

  it("treats counter decreases as resets (pod restart), re-basing instead of negative rates", () => {
    recordScrape([sample("m_total", {}, 1000)], 0);
    recordScrape([sample("m_total", {}, 50)], 30_000); // restart
    expect(computeRates("m_total")[0].perSecond).toBe(0);
    recordScrape([sample("m_total", {}, 110)], 60_000);
    expect(computeRates("m_total")[0].perSecond).toBeCloseTo(2);
  });

  it("keeps a bounded series of rate points for charting", () => {
    for (let i = 0; i <= 150; i++) {
      recordScrape([sample("m_total", {}, i * 10)], i * 15_000);
    }
    const series = usageSeries("m_total", {});
    expect(series.length).toBeLessThanOrEqual(120);
    expect(series.at(-1)!.v).toBeCloseTo(10 / 15);
  });
});

describe("groupBy", () => {
  it("sums rate values per label", () => {
    const rates = [
      { labels: { model: "a", type: "input" }, perSecond: 2 },
      { labels: { model: "a", type: "output" }, perSecond: 1 },
      { labels: { model: "b", type: "input" }, perSecond: 5 },
    ];
    expect(groupBy(rates, "model")).toEqual([
      { key: "b", perSecond: 5 },
      { key: "a", perSecond: 3 },
    ]);
  });
});
