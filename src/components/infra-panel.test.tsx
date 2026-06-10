import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InfraPanel } from "@/components/infra-panel";
import type { InfraPod, InfraResponse } from "@/lib/api-client";
import { mockFetch, renderWithProviders } from "@/test/utils";

// Node 22+ exposes a non-functional window.localStorage (requires --localstorage-file);
// api-client reads the stored kube context from it on every request, so give it a real one.
const __store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => __store.get(k) ?? null,
  setItem: (k: string, v: string) => void __store.set(k, v),
  removeItem: (k: string) => void __store.delete(k),
  clear: () => __store.clear(),
});


function pod(overrides: Partial<InfraPod>): InfraPod {
  return {
    name: "pod",
    namespace: "agentgateway-system",
    role: "proxy",
    phase: "Running",
    ready: "1/1",
    restarts: 0,
    ...overrides,
  };
}

function mockInfra(body: InfraResponse) {
  return mockFetch([{ match: "/api/infra", body }]);
}

describe("InfraPanel", () => {
  it("shows loading skeletons while fetching", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = renderWithProviders(<InfraPanel />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });

  it("groups pods into Proxies and Control plane with counts", async () => {
    mockInfra({
      metricsAvailable: true,
      pods: [
        pod({ name: "gw-proxy-abc", role: "proxy", gateway: "api-agentgateway", cpuMillis: 250, memoryBytes: 64 * 1024 * 1024 }),
        pod({ name: "gw-proxy-def", role: "proxy", gateway: "other-gw", cpuMillis: 5, memoryBytes: 1024 * 1024 }),
        pod({ name: "agentgateway-controller-xyz", role: "controlplane", cpuMillis: 10, memoryBytes: 2 * 1024 * 1024 }),
      ],
    });
    renderWithProviders(<InfraPanel />);

    expect(await screen.findByText("Proxies (data plane)")).toBeInTheDocument();
    expect(screen.getByText("Control plane")).toBeInTheDocument();
    expect(screen.getByText("gw-proxy-abc")).toBeInTheDocument();
    expect(screen.getByText("gw-proxy-def")).toBeInTheDocument();
    expect(screen.getByText("agentgateway-controller-xyz")).toBeInTheDocument();
    // group count badges
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    // proxy pods deep-link to their gateway
    expect(screen.getByRole("link", { name: "api-agentgateway" })).toHaveAttribute(
      "href",
      "/resources/gateways/agentgateway-system/api-agentgateway",
    );
    expect(screen.getByText("live usage · 15s")).toBeInTheDocument();
  });

  it("hides usage cells and shows a note when metrics-server is unavailable", async () => {
    mockInfra({
      metricsAvailable: false,
      pods: [pod({ name: "gw-proxy-abc", cpuMillis: undefined, memoryBytes: undefined })],
    });
    const { container } = renderWithProviders(<InfraPanel />);

    expect(
      await screen.findByText("metrics-server not available — usage hidden"),
    ).toBeInTheDocument();
    expect(container.querySelector("svg.text-chart-1")).not.toBeInTheDocument();
    expect(container.querySelector("svg.text-chart-3")).not.toBeInTheDocument();
  });

  it("highlights restarts greater than zero", async () => {
    mockInfra({
      metricsAvailable: false,
      pods: [
        pod({ name: "flappy-pod", restarts: 7 }),
        pod({ name: "steady-pod", role: "controlplane", restarts: 0 }),
      ],
    });
    renderWithProviders(<InfraPanel />);

    const restarts = await screen.findByText(/7 restarts/);
    expect(restarts).toHaveClass("text-warning");
    expect(screen.queryByText(/0 restarts/)).not.toBeInTheDocument();
  });

  it("marks not-ready and pending pods with the right dots", async () => {
    mockInfra({
      metricsAvailable: false,
      pods: [
        pod({ name: "ok-pod", ready: "1/1", phase: "Running" }),
        pod({ name: "crash-pod", ready: "0/1", phase: "Running" }),
        pod({ name: "new-pod", ready: "0/1", phase: "Pending" }),
      ],
    });
    renderWithProviders(<InfraPanel />);

    const dotOf = (name: string) =>
      screen.getByText(name).closest("li")!.querySelector(".status-dot");
    await screen.findByText("ok-pod");
    expect(dotOf("ok-pod")).toHaveClass("status-dot-healthy");
    expect(dotOf("crash-pod")).toHaveClass("status-dot-degraded");
    expect(dotOf("new-pod")).toHaveClass("status-dot-pending");
  });

  it("shows the empty message when no agentgateway pods exist", async () => {
    mockInfra({ metricsAvailable: true, pods: [] });
    renderWithProviders(<InfraPanel />);
    expect(
      await screen.findByText(/No agentgateway pods found/),
    ).toBeInTheDocument();
  });
});
