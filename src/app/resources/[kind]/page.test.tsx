import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, Suspense, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResourceListPage from "@/app/resources/[kind]/page";
import { gateway, namespaceList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders, resolvedParams } from "@/test/utils";

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
const notFound = vi.fn(() => {
  throw new Error("notFound");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => "/resources/gateways",
  notFound: () => notFound(),
}));

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <div data-testid="boundary">{this.state.error.message}</div> : this.props.children;
  }
}

function renderPage(kind: string) {
  return renderWithProviders(
    <Boundary>
      <Suspense fallback={null}>
        <ResourceListPage params={resolvedParams({ kind })} />
      </Suspense>
    </Boundary>,
  );
}

describe("ResourceListPage", () => {
  beforeEach(() => {
    mockResourceLists({ gateways: [gateway], namespaces: namespaceList });
  });
  afterEach(() => {
    notFound.mockClear();
  });

  it("renders the header, count, and table rows", async () => {
    renderPage("gateways");
    expect(await screen.findByRole("heading", { name: /Gateways/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "api-agentgateway" })).toHaveAttribute(
      "href",
      "/resources/gateways/agentgateway-system/api-agentgateway",
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create Gateway/ })).toHaveAttribute(
      "href",
      "/resources/gateways/new",
    );
  });

  it("filters rows by the search box and shows a no-match message", async () => {
    renderPage("gateways");
    await screen.findByRole("link", { name: "api-agentgateway" });

    const search = screen.getByPlaceholderText("Search gateways…");
    await userEvent.type(search, "api-agent");
    expect(screen.getByRole("link", { name: "api-agentgateway" })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "zzz-no-match");
    expect(screen.queryByRole("link", { name: "api-agentgateway" })).not.toBeInTheDocument();
    expect(screen.getByText(/No matches for/)).toBeInTheDocument();
  });

  it("shows the empty state when the list is empty", async () => {
    mockResourceLists({ gateways: [], namespaces: namespaceList });
    renderPage("gateways");
    expect(await screen.findByText("No gateways yet")).toBeInTheDocument();
  });

  it("throws notFound for an unknown kind", async () => {
    renderPage("definitely-not-a-kind");
    expect(await screen.findByTestId("boundary")).toHaveTextContent("notFound");
    expect(notFound).toHaveBeenCalled();
  });
});
