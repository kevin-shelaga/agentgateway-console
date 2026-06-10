import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PodDetailPage from "@/app/pods/[namespace]/[name]/page";
import { clearHistory, recordSamples } from "@/lib/metrics-history";
import { mockFetch, renderWithProviders, resolvedParams } from "@/test/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/pods/agentgateway-system/api-agentgateway-abc",
}));

const podDetail = {
  name: "api-agentgateway-abc",
  namespace: "agentgateway-system",
  role: "proxy",
  gateway: "api-agentgateway",
  phase: "Running",
  ready: "1/1",
  restarts: 0,
  node: "node-a",
  startTime: "2026-06-01T00:00:00Z",
  containers: [{ name: "agentgateway", image: "agw:v1", ready: true, restartCount: 0, state: "running" }],
};

const infraPod = {
  name: podDetail.name,
  namespace: podDetail.namespace,
  role: "proxy" as const,
  phase: "Running",
  ready: "1/1",
  restarts: 0,
  cpuMillis: 2,
  memoryBytes: 16 * 1024 * 1024,
};

function setup(logs = "2026-06-10T12:00:00Z starting gateway\n2026-06-10T12:00:01Z listening :80") {
  // Later entries win in mockFetch; /logs must come after the detail route
  // because the detail URL is a substring of the logs URL.
  return mockFetch([
    { match: "/api/infra", body: { metricsAvailable: true, pods: [infraPod] } },
    { match: "/api/pods/agentgateway-system/api-agentgateway-abc", body: podDetail },
    { match: "/logs?", body: { logs, container: "agentgateway" } },
    // Follow is on by default: the live tail comes from the chunked stream.
    { match: "/logs/stream?", body: logs, raw: true },
  ]);
}

function renderPage() {
  return renderWithProviders(
    <Suspense fallback={null}>
      <PodDetailPage
        params={resolvedParams({ namespace: "agentgateway-system", name: "api-agentgateway-abc" })}
      />
    </Suspense>,
  );
}

describe("PodDetailPage", () => {
  beforeEach(clearHistory);

  it("renders identity, role badge, gateway link, and logs", async () => {
    setup();
    renderPage();

    expect(await screen.findByText(/proxy · data plane/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gateway:/ })).toHaveAttribute(
      "href",
      "/resources/gateways/agentgateway-system/api-agentgateway",
    );
    expect(await screen.findByText(/listening :80/)).toBeInTheDocument();
  });

  it("shows the collecting state before samples exist, charts once history accumulates", async () => {
    setup();
    renderPage();
    expect((await screen.findAllByText(/Collecting samples/)).length).toBe(2);

    clearHistory();
    recordSamples([infraPod], 1000);
    recordSamples([{ ...infraPod, cpuMillis: 4, memoryBytes: 32 * 1024 * 1024 }], 16000);
    // Trigger a re-render (refresh is disabled while following).
    fireEvent.click(screen.getByRole("switch", { name: "Follow logs" }));
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "cpu usage trend" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "mem usage trend" })).toBeInTheDocument();
    });
    expect(screen.getByText("4m")).toBeInTheDocument(); // current CPU
    expect(screen.getByText("32Mi")).toBeInTheDocument(); // current memory
  });

  it("tails via the stream endpoint with the selected tail size while following", async () => {
    const spy = setup();
    renderPage();
    await screen.findByText(/listening :80/);
    const streamCalls = spy.mock.calls.filter(([u]) => String(u).includes("/logs/stream?"));
    expect(streamCalls.length).toBeGreaterThan(0);
    expect(String(streamCalls[0][0])).toContain("tailLines=500");
    // The static endpoint is not used while following.
    expect(spy.mock.calls.some(([u]) => /logs\?/.test(String(u)))).toBe(false);
  });

  it("falls back to the one-shot tail when follow is turned off", async () => {
    const spy = setup();
    renderPage();
    await screen.findByText(/listening :80/);
    fireEvent.click(screen.getByRole("switch", { name: "Follow logs" }));
    await waitFor(() =>
      expect(spy.mock.calls.some(([u]) => String(u).includes("/logs?"))).toBe(true),
    );
  });

  it("surfaces 403s from the scope guard", async () => {
    mockFetch([
      {
        match: "/api/pods/",
        status: 403,
        body: { error: { status: 403, reason: "Forbidden", message: "not an agentgateway pod", causes: [] } },
      },
      { match: "/api/infra", body: { metricsAvailable: false, pods: [] } },
    ]);
    renderPage();
    expect(await screen.findByText(/not an agentgateway pod/)).toBeInTheDocument();
  });
});
