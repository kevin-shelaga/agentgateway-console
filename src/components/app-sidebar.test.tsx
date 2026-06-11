import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
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


const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => "/resources/gateways",
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

function renderSidebar() {
  mockFetch([
    { match: "/api/cluster", body: { connected: true, context: "test-ctx" } },
    { match: "/api/contexts", body: { contexts: ["test-ctx"], current: "test-ctx", inCluster: false } },
  ]);
  return renderWithProviders(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
  );
}

describe("AppSidebar", () => {
  it("renders the dashboard link and both nav groups", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/");
    expect(screen.getAllByText("Gateway API").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Agentgateway").length).toBeGreaterThanOrEqual(1);
  });

  it("renders one nav entry per registry resource with the right href", () => {
    renderSidebar();
    const expected: Array<[string, string]> = [
      ["Gateway Classes", "/resources/gatewayclasses"],
      ["Gateways", "/resources/gateways"],
      ["HTTP Routes", "/resources/httproutes"],
      ["GRPC Routes", "/resources/grpcroutes"],
      ["Backends", "/resources/backends"],
      ["Policies", "/resources/policies"],
      ["Parameters", "/resources/parameters"],
    ];
    for (const [label, href] of expected) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("highlights only the active route from usePathname", () => {
    renderSidebar();
    const active = screen.getByRole("link", { name: "Gateways" }).closest('[data-active="true"]');
    expect(active).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "HTTP Routes" }).closest('[data-active="true"]'),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /Dashboard/ }).closest('[data-active="true"]'),
    ).toBeNull();
  });
});

describe("Docs section", () => {
  it("links out to agentgateway, enterprise, and Gateway API docs in new tabs", () => {
    renderSidebar();
    const expectations: Array<[string, string]> = [
      ["Agentgateway", "https://agentgateway.dev/docs/"],
      ["Enterprise Agentgateway", "https://docs.solo.io/agentgateway/"],
      ["Gateway API", "https://gateway-api.sigs.k8s.io/"],
    ];
    for (const [name, href] of expectations) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
