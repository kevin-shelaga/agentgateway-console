import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsagePage from "@/app/usage/page";
import type { PromSample } from "@/lib/prom-parse";
import { clearUsageHistory, recordScrape } from "@/lib/usage-metrics";
import { mockFetch, renderWithProviders } from "@/test/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/usage",
}));

function sample(name: string, labels: Record<string, string>, value: number): PromSample {
  return { name, labels, value };
}

function seedHistory() {
  // Two polls 15s apart → non-zero rates and chartable points.
  const at = (n: number) => n * 15_000;
  const scrape = (factor: number) => [
    sample("agentgateway_requests_total", { gateway: "agw/gw", status: "200" }, 600 * factor),
    sample("agentgateway_requests_total", { gateway: "agw/gw", status: "404" }, 30 * factor),
    sample("agentgateway_request_duration_seconds_sum", { gateway: "agw/gw" }, 12 * factor),
    sample("agentgateway_request_duration_seconds_count", { gateway: "agw/gw" }, 600 * factor),
    sample(
      "agentgateway_gen_ai_client_token_usage_sum",
      { gen_ai_token_type: "input", gen_ai_request_model: "gpt-4o-mini", gen_ai_system: "openai" },
      9000 * factor,
    ),
    sample(
      "agentgateway_gen_ai_client_token_usage_count",
      { gen_ai_token_type: "input", gen_ai_request_model: "gpt-4o-mini", gen_ai_system: "openai" },
      30 * factor,
    ),
  ];
  recordScrape(scrape(1), at(1));
  recordScrape(scrape(2), at(2));
  recordScrape(scrape(3), at(3));
}

const apiBody = {
  scraped: ["agw/p1", "agw/p2"],
  failed: [],
  samples: [],
  at: 60_000,
};

describe("UsagePage", () => {
  beforeEach(clearUsageHistory);

  it("shows the token empty state when no gen_ai series exist", async () => {
    mockFetch([{ match: "/api/metrics/llm", body: apiBody }]);
    renderWithProviders(<UsagePage />);
    expect(await screen.findByText(/No token metrics yet/)).toBeInTheDocument();
    expect(await screen.findByText("2 proxies · summed")).toBeInTheDocument();
  });

  it("renders token and traffic charts from accumulated rates", async () => {
    seedHistory();
    mockFetch([{ match: "/api/metrics/llm", body: apiBody }]);
    renderWithProviders(<UsagePage />);

    expect(await screen.findByRole("img", { name: "input tokens usage trend" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "requests usage trend" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "latency usage trend" })).toBeInTheDocument();
    // By-model and by-status breakdowns.
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
    expect(screen.getByText("2xx")).toBeInTheDocument();
    expect(screen.getByText("4xx")).toBeInTheDocument();
    // 600 requests / 15s = 40/s for 2xx
    expect(screen.getByText("40/s")).toBeInTheDocument();
  });

  it("surfaces partially failed scrapes", async () => {
    mockFetch([
      { match: "/api/metrics/llm", body: { ...apiBody, failed: ["agw/p2"] } },
    ]);
    renderWithProviders(<UsagePage />);
    expect(await screen.findByText(/could not be scraped: agw\/p2/)).toBeInTheDocument();
  });
});
