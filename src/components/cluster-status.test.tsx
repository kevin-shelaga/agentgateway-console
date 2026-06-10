import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClusterStatus } from "@/components/cluster-status";
import { KubeContext } from "@/lib/hooks";
import { mockFetch } from "@/test/utils";

// Node 22+ exposes a non-functional window.localStorage (requires --localstorage-file);
// api-client reads the stored kube context from it on every request, so give it a real one.
const __store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => __store.get(k) ?? null,
  setItem: (k: string, v: string) => void __store.set(k, v),
  removeItem: (k: string) => void __store.delete(k),
  clear: () => __store.clear(),
});


function renderClusterStatus(setContext = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <KubeContext.Provider value={{ context: null, setContext }}>
        <ClusterStatus />
      </KubeContext.Provider>
    </QueryClientProvider>,
  );
  return { ...result, setContext };
}

describe("ClusterStatus", () => {
  it("shows a healthy dot and the current context when connected", async () => {
    mockFetch([
      { match: "/api/cluster", body: { connected: true, context: "prod-cluster" } },
      {
        match: "/api/contexts",
        body: { contexts: ["prod-cluster", "staging"], current: "prod-cluster", inCluster: false },
      },
    ]);
    const { container } = renderClusterStatus();

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("prod-cluster")).toBeInTheDocument();
    expect(container.querySelector(".status-dot-healthy")).toBeInTheDocument();
  });

  it("switches context via the dropdown", async () => {
    mockFetch([
      { match: "/api/cluster", body: { connected: true, context: "prod-cluster" } },
      {
        match: "/api/contexts",
        body: { contexts: ["prod-cluster", "staging"], current: "prod-cluster", inCluster: false },
      },
    ]);
    const { setContext } = renderClusterStatus();

    await screen.findByText("Connected");
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "staging" }));
    expect(setContext).toHaveBeenCalledWith("staging");
  });

  it("renders static 'this cluster' with no dropdown when locked in-cluster", async () => {
    mockFetch([
      { match: "/api/cluster", body: { connected: true, context: "in-cluster" } },
      { match: "/api/contexts", body: { contexts: [], current: "in-cluster", inCluster: true } },
    ]);
    renderClusterStatus();

    expect(await screen.findByText("this cluster")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the unreachable state when the cluster is not connected", async () => {
    mockFetch([
      {
        match: "/api/cluster",
        body: { connected: false, context: "prod-cluster", error: "dial tcp: timeout" },
      },
      {
        match: "/api/contexts",
        body: { contexts: ["prod-cluster"], current: "prod-cluster", inCluster: false },
      },
    ]);
    const { container } = renderClusterStatus();

    expect(await screen.findByText("Unreachable")).toBeInTheDocument();
    expect(container.querySelector(".status-dot-healthy")).not.toBeInTheDocument();
  });
});
