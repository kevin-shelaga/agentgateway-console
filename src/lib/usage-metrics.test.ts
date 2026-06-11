import { beforeEach, describe, expect, it } from "vitest";
import {
  clearUsageHistory,
  computeRates,
  groupBy,
  recordScrape,
  sessionTotalsBy,
  sliceWindow,
  sumTotals,
  totals,
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

describe("totals", () => {
  beforeEach(clearUsageHistory);

  it("reports lifetime values and session deltas per series", () => {
    recordScrape([sample("t_sum", { user: "alice" }, 1000)], 0);
    recordScrape([sample("t_sum", { user: "alice" }, 1600)], 15_000);
    recordScrape([sample("t_sum", { user: "alice" }, 2000)], 30_000);
    const [entry] = totals("t_sum");
    expect(entry.value).toBe(2000); // since pod start
    expect(entry.sessionDelta).toBe(1000); // observed while open: 600 + 400
  });

  it("session deltas survive counter resets without going negative", () => {
    recordScrape([sample("t_sum", {}, 500)], 0);
    recordScrape([sample("t_sum", {}, 800)], 15_000); // +300
    recordScrape([sample("t_sum", {}, 100)], 30_000); // restart → +0
    recordScrape([sample("t_sum", {}, 250)], 45_000); // +150
    expect(totals("t_sum")[0].sessionDelta).toBe(450);
  });

  it("sumTotals aggregates with an optional label filter", () => {
    recordScrape(
      [
        sample("t_sum", { gen_ai_token_type: "input" }, 100),
        sample("t_sum", { gen_ai_token_type: "output" }, 40),
      ],
      0,
    );
    recordScrape(
      [
        sample("t_sum", { gen_ai_token_type: "input" }, 160),
        sample("t_sum", { gen_ai_token_type: "output" }, 70),
      ],
      15_000,
    );
    const all = sumTotals(totals("t_sum"));
    expect(all.lifetime).toBe(230);
    expect(all.session).toBe(90);
    const input = sumTotals(totals("t_sum"), (l) => l.gen_ai_token_type === "input");
    expect(input.lifetime).toBe(160);
    expect(input.session).toBe(60);
  });

  it("sessionTotalsBy groups session deltas by a label, descending", () => {
    recordScrape(
      [sample("t_sum", { user: "alice" }, 0), sample("t_sum", { user: "bob" }, 0)],
      0,
    );
    recordScrape(
      [sample("t_sum", { user: "alice" }, 100), sample("t_sum", { user: "bob" }, 700)],
      15_000,
    );
    expect(sessionTotalsBy(totals("t_sum"), "user")).toEqual([
      { key: "bob", total: 700 },
      { key: "alice", total: 100 },
    ]);
  });
});

describe("sliceWindow", () => {
  it("keeps only points within the window, anchored to the newest point", () => {
    const points = [0, 1, 2, 3, 4].map((i) => ({ t: i * 60_000, v: i }));
    expect(sliceWindow(points, 2 * 60_000).map((p) => p.v)).toEqual([2, 3, 4]);
    expect(sliceWindow(points, 60 * 60_000)).toHaveLength(5);
    expect(sliceWindow([], 60_000)).toEqual([]);
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
