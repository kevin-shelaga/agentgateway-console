import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/dashboard";
import type { FetchRoute } from "@/test/utils";
import {
  aiBackend,
  degradedRoute,
  gateway,
  gatewayClass,
  httpRoute,
  policy,
  staticBackend,
} from "@/test/fixtures";
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


vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

const INFRA: FetchRoute = { match: "/api/infra", body: { metricsAvailable: false, pods: [] } };

describe("Dashboard", () => {
  it("renders stat tiles, fleet rows, and the cluster name", async () => {
    mockFetch([
      { match: "/gateways", body: { items: [gateway] } },
      { match: "/httproutes", body: { items: [httpRoute, degradedRoute] } },
      { match: "/grpcroutes", body: { items: [] } },
      { match: "/agentgatewaybackends", body: { items: [aiBackend, staticBackend] } },
      { match: "/agentgatewaypolicies", body: { items: [policy] } },
      { match: "/gatewayclasses", body: { items: [gatewayClass] } },
      { match: "/api/cluster", body: { connected: true, context: "test-ctx" } },
      INFRA,
    ]);
    renderWithProviders(<Dashboard />);

    expect(await screen.findByText("test-ctx")).toBeInTheDocument();

    const tileCount = (name: string) => {
      const tile = screen.getByText(name).closest("a") as HTMLElement;
      return tile.querySelector(".text-3xl")?.textContent;
    };
    expect(tileCount("Gateways")).toBe("1");
    expect(tileCount("HTTP Routes")).toBe("2");
    expect(tileCount("Backends")).toBe("2");
    expect(tileCount("Policies")).toBe("1");

    // Gateway fleet row: name, listeners, address
    const fleet = screen.getByText("Gateway fleet").closest('[data-slot="card"]') as HTMLElement;
    expect(within(fleet).getByText("api-agentgateway")).toBeInTheDocument();
    expect(within(fleet).getByText("HTTP:80")).toBeInTheDocument();
    expect(within(fleet).getByText("HTTPS:443")).toBeInTheDocument();
    expect(within(fleet).getByText("4.229.185.215")).toBeInTheDocument();

    // Backends by type + AI providers
    expect(screen.getByText("AI / LLM")).toBeInTheDocument();
    expect(screen.getByText("Static")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
  });

  it("lists condition failures and config issues under Needs attention", async () => {
    mockFetch([
      { match: "/gateways", body: { items: [gateway] } },
      { match: "/httproutes", body: { items: [httpRoute, degradedRoute] } },
      { match: "/grpcroutes", body: { items: [] } },
      // staticBackend is referenced by no route → config issue
      { match: "/agentgatewaybackends", body: { items: [aiBackend, staticBackend] } },
      { match: "/agentgatewaypolicies", body: { items: [policy] } },
      { match: "/gatewayclasses", body: { items: [gatewayClass] } },
      { match: "/api/cluster", body: { connected: true, context: "test-ctx" } },
      INFRA,
    ]);
    renderWithProviders(<Dashboard />);

    const heading = await screen.findByText("Needs attention");
    const card = heading.closest('[data-slot="card"]') as HTMLElement;

    // Condition failure from degradedRoute
    const broken = await within(card).findByText("agents/broken-route");
    expect(broken).toBeInTheDocument();
    expect(
      within(card).getByText(/backend missing-svc not found/),
    ).toBeInTheDocument();

    // Config-completeness issue for the orphan backend, tagged "config"
    const orphan = within(card).getByText("agents/static-backend");
    expect(orphan).toBeInTheDocument();
    expect(within(card).getByText("not referenced by any route")).toBeInTheDocument();
    expect(within(card).getByText("config")).toBeInTheDocument();
    // badge counts both kinds of issues
    expect(within(card).getByText("2")).toBeInTheDocument();
    expect(within(card).queryByText(/Configuration looks good/)).toBeNull();
  });

  it("shows the all-clear message when everything is healthy and wired", async () => {
    mockFetch([
      { match: "/gateways", body: { items: [gateway] } },
      { match: "/httproutes", body: { items: [httpRoute] } },
      { match: "/grpcroutes", body: { items: [] } },
      { match: "/agentgatewaybackends", body: { items: [aiBackend] } },
      { match: "/agentgatewaypolicies", body: { items: [policy] } },
      { match: "/gatewayclasses", body: { items: [gatewayClass] } },
      { match: "/api/cluster", body: { connected: true, context: "test-ctx" } },
      INFRA,
    ]);
    renderWithProviders(<Dashboard />);

    expect(
      await screen.findByText(/Configuration looks good — all conditions are healthy/),
    ).toBeInTheDocument();
  });

  it("renders the unreachable state when the cluster is down", async () => {
    mockFetch([
      { match: "/api/cluster", body: { connected: false, context: null, error: "dial timeout" } },
      INFRA,
    ]);
    renderWithProviders(<Dashboard />);

    expect(await screen.findByText("Cluster unreachable")).toBeInTheDocument();
    expect(screen.getByText("dial timeout")).toBeInTheDocument();
    expect(screen.queryByText("Gateway fleet")).not.toBeInTheDocument();
  });
});
