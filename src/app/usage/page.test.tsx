import { fireEvent, screen } from "@testing-library/react";
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
  // Three polls 15s apart → non-zero rates, session deltas, chartable points.
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
    // Per-user series (custom `user` metric label) on a named route.
    sample(
      "agentgateway_gen_ai_client_token_usage_sum",
      { gen_ai_token_type: "output", gen_ai_request_model: "gpt-4.1", gen_ai_system: "openai", route: "default-llm", user: "alice" },
      3000 * factor,
    ),
    sample(
      "agentgateway_gen_ai_client_token_usage_sum",
      { gen_ai_token_type: "output", gen_ai_request_model: "gpt-4.1", gen_ai_system: "openai", route: "default-llm", user: "bob" },
      1500 * factor,
    ),
    // LLM latency histograms: avg TTFT 200ms, 50 output tokens/s.
    sample("agentgateway_gen_ai_server_time_to_first_token_sum", { gen_ai_system: "openai" }, 6 * factor),
    sample("agentgateway_gen_ai_server_time_to_first_token_count", { gen_ai_system: "openai" }, 30 * factor),
    sample("agentgateway_gen_ai_server_time_per_output_token_sum", { gen_ai_system: "openai" }, 2 * factor),
    sample("agentgateway_gen_ai_server_time_per_output_token_count", { gen_ai_system: "openai" }, 100 * factor),
    sample(
      "agentgateway_mcp_requests_total",
      { method: "tools/call", server: "github", resource: "search_issues" },
      60 * factor,
    ),
    sample("agentgateway_guardrail_checks_total", { phase: "Request", action: "Reject" }, 5 * factor),
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

  it("shows empty states when no series exist", async () => {
    mockFetch([{ match: "/api/metrics/llm", body: apiBody }]);
    renderWithProviders(<UsagePage />);
    expect(await screen.findByText(/No token metrics yet/)).toBeInTheDocument();
    expect(await screen.findByText("2 proxies · summed")).toBeInTheDocument();
    expect(screen.getByText(/to attribute tokens per/)).toBeInTheDocument();
    expect(screen.getByText(/No MCP tool calls observed/)).toBeInTheDocument();
    expect(screen.getByText(/No guardrail activity/)).toBeInTheDocument();
    // Stat cards render with placeholder values.
    expect(screen.getByText("Total tokens")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
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

  it("shows totals, LLM latency stats, and by-route bars", async () => {
    seedHistory();
    mockFetch([{ match: "/api/metrics/llm", body: apiBody }]);
    renderWithProviders(<UsagePage />);

    // Lifetime: (9000 + 3000 + 1500) × 3 = 40500; session deltas: 13500 × 2.
    expect(await screen.findByText("40.5k")).toBeInTheDocument();
    expect(screen.getByText("27.0k")).toBeInTheDocument();
    // TTFT avg 6/30 = 200ms; speed 1 / (2/100) = 50 tok/s.
    expect(screen.getByText("200ms")).toBeInTheDocument();
    expect(screen.getByText("50 tok/s")).toBeInTheDocument();
    // Token route label from the per-user series.
    expect(screen.getAllByText("default-llm").length).toBeGreaterThanOrEqual(1);
  });

  it("attributes tokens per user when the custom label is present", async () => {
    seedHistory();
    mockFetch([{ match: "/api/metrics/llm", body: apiBody }]);
    renderWithProviders(<UsagePage />);

    expect(await screen.findByText("Tokens by user")).toBeInTheDocument();
    // Session totals (left) + live rates (right) → each user appears twice.
    expect(screen.getAllByText("alice")).toHaveLength(2);
    expect(screen.getAllByText("bob")).toHaveLength(2);
    // alice session delta: 3000 × 2 scrapes = 6000.
    expect(screen.getByText("6000")).toBeInTheDocument();
  });

  it("shows MCP tool-call and guardrail activity", async () => {
    seedHistory();
    mockFetch([{ match: "/api/metrics/llm", body: apiBody }]);
    renderWithProviders(<UsagePage />);

    expect(await screen.findByText("search_issues")).toBeInTheDocument();
    expect(screen.getByText("github")).toBeInTheDocument();
    // 60/15s = 4/s by tool; guardrail lifetime count 15.
    expect(screen.getAllByText("4.0/s").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Request · Reject")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("offers timeframe windows with 30m default", async () => {
    seedHistory();
    mockFetch([{ match: "/api/metrics/llm", body: apiBody }]);
    renderWithProviders(<UsagePage />);

    const btn30 = await screen.findByRole("button", { name: "30m" });
    const btn5 = screen.getByRole("button", { name: "5m" });
    expect(btn30).toHaveAttribute("aria-pressed", "true");
    expect(btn5).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn5);
    expect(btn5).toHaveAttribute("aria-pressed", "true");
    expect(btn30).toHaveAttribute("aria-pressed", "false");
    // Charts still render from the narrowed window.
    expect(screen.getByRole("img", { name: "requests usage trend" })).toBeInTheDocument();
  });

  it("surfaces partially failed scrapes", async () => {
    mockFetch([
      { match: "/api/metrics/llm", body: { ...apiBody, failed: ["agw/p2"] } },
    ]);
    renderWithProviders(<UsagePage />);
    expect(await screen.findByText(/could not be scraped: agw\/p2/)).toBeInTheDocument();
  });
});
