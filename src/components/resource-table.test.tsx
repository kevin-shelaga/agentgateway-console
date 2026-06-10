import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceTable } from "@/components/resource-table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getResource } from "@/lib/registry";
import { gateway } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => "/resources/gateways",
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

import { toast } from "sonner";

// Node 22+ exposes a non-functional window.localStorage (requires --localstorage-file);
// api-client reads the stored kube context from it on every request, so give it a real one.
const __store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => __store.get(k) ?? null,
  setItem: (k: string, v: string) => void __store.set(k, v),
  removeItem: (k: string) => void __store.delete(k),
  clear: () => __store.clear(),
});


const desc = getResource("gateways")!;
const detailHref = "/resources/gateways/agentgateway-system/api-agentgateway";

function renderTable(d = desc, items = [gateway]) {
  return renderWithProviders(
    <TooltipProvider delayDuration={0}>
      <ResourceTable desc={d} items={items} />
    </TooltipProvider>,
  );
}

describe("ResourceTable", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("renders name, namespace, custom columns, status, and age", () => {
    mockFetch([]);
    renderTable();
    const link = screen.getByRole("link", { name: "api-agentgateway" });
    expect(link).toHaveAttribute("href", detailHref);
    expect(screen.getByText("agentgateway-system")).toBeInTheDocument();
    // listColumns: class, listeners (badges), address
    expect(screen.getByText("agentgateway")).toBeInTheDocument();
    expect(screen.getByText("HTTP:80")).toBeInTheDocument();
    expect(screen.getByText("HTTPS:443")).toBeInTheDocument();
    expect(screen.getByText("4.229.185.215")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    // creationTimestamp is in the past → age like "21d", never the em dash
    const row = screen.getByRole("link", { name: "api-agentgateway" }).closest("tr")!;
    expect(within(row).getAllByRole("cell").at(-2)!.textContent).toMatch(/^\d+[smhdy]$/);
  });

  it("renders an em dash for missing cell values", () => {
    mockFetch([]);
    const bare = {
      ...gateway,
      metadata: { ...gateway.metadata, name: "bare-gw", creationTimestamp: undefined },
      spec: {},
      status: undefined,
    };
    renderTable(desc, [bare]);
    const row = screen.getByRole("link", { name: "bare-gw" }).closest("tr")!;
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("shows the status message in a tooltip", async () => {
    mockFetch([]);
    renderTable();
    await userEvent.hover(screen.getByText("Healthy"));
    expect((await screen.findAllByText("All conditions healthy")).length).toBeGreaterThan(0);
  });

  it("navigates to the detail page on row click and via the View action", async () => {
    mockFetch([]);
    renderTable();
    await userEvent.click(screen.getByText("agentgateway-system"));
    expect(push).toHaveBeenCalledWith(detailHref);

    push.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Row actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /View/ }));
    expect(push).toHaveBeenCalledWith(detailHref);
  });

  it("navigates to the edit page via the Edit action", async () => {
    mockFetch([]);
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Row actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Edit/ }));
    expect(push).toHaveBeenCalledWith(`${detailHref}/edit`);
  });

  it("deletes after confirmation and shows a success toast", async () => {
    const fetchSpy = mockFetch([
      { match: "/gateways/agentgateway-system/api-agentgateway", body: {} },
    ]);
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Row actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));

    // Confirm dialog (Radix portal)
    expect(await screen.findByText("Delete Gateway?")).toBeInTheDocument();
    expect(screen.getByText(/This permanently deletes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    const deleteCall = fetchSpy.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall![0])).toContain(
      "/gateways/agentgateway-system/api-agentgateway",
    );
    expect(toast.success).toHaveBeenCalledWith("Gateway api-agentgateway deleted");
  });

  it("shows an error toast when delete fails", async () => {
    mockFetch([
      {
        match: "/gateways/agentgateway-system/api-agentgateway",
        body: { error: { status: 403, reason: "Forbidden", message: "RBAC says no", causes: [] } },
        status: 403,
      },
    ]);
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Row actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(toast.error).toHaveBeenCalledWith("RBAC says no");
  });

  it("cancelling the dialog does not delete", async () => {
    const fetchSpy = mockFetch([]);
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Row actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(
      fetchSpy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("hides Edit and Delete for read-only descriptors", async () => {
    mockFetch([]);
    renderTable({ ...desc, readOnly: true });
    await userEvent.click(screen.getByRole("button", { name: "Row actions" }));
    expect(await screen.findByRole("menuitem", { name: /View/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Delete/ })).not.toBeInTheDocument();
  });
});

describe("ResourceTable sorting and filtering", () => {
  const second = {
    ...gateway,
    metadata: {
      ...gateway.metadata,
      name: "zz-gateway",
      creationTimestamp: "2026-06-01T00:00:00Z",
    },
    spec: { ...gateway.spec, gatewayClassName: "other-class" },
    status: {
      conditions: [{ type: "Programmed", status: "False", message: "broken" }],
    },
  };

  function rowNames(): string[] {
    return screen.getAllByRole("link").map((l) => l.textContent ?? "");
  }

  it("sorts by name ascending, then descending, then resets", async () => {
    mockFetch([]);
    renderTable(desc, [second, gateway]);
    const sortButton = screen.getByRole("button", { name: "Sort by Name" });

    await userEvent.click(sortButton);
    expect(rowNames()[0]).toBe("api-agentgateway");
    await userEvent.click(sortButton);
    expect(rowNames()[0]).toBe("zz-gateway");
    await userEvent.click(sortButton);
    expect(rowNames()[0]).toBe("zz-gateway"); // original order restored
  });

  it("sorts by status severity (degraded first)", async () => {
    mockFetch([]);
    renderTable(desc, [gateway, second]);
    await userEvent.click(screen.getByRole("button", { name: "Sort by Status" }));
    expect(rowNames()[0]).toBe("zz-gateway");
  });

  it("filters rows via a column facet", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockFetch([]);
    renderTable(desc, [gateway, second]);

    await user.click(screen.getByRole("button", { name: "Filter Class" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /other-class/ }));
    await user.keyboard("{Escape}"); // open menus aria-hide the table behind them
    expect(rowNames()).toEqual(["zz-gateway"]);
  });

  it("filters by status facet and offers clearing when nothing matches", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockFetch([]);
    renderTable(desc, [gateway, second]);

    await user.click(screen.getByRole("button", { name: "Filter Status" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /Healthy/ }));
    await user.keyboard("{Escape}");
    expect(rowNames()).toEqual(["api-agentgateway"]);

    // Add a contradictory class filter → no rows → clear-filters escape hatch.
    await user.click(screen.getByRole("button", { name: "Filter Class" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /other-class/ }));
    await user.keyboard("{Escape}");
    expect(screen.getByText(/No rows match the filters/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rowNames()).toHaveLength(2);
  });
});
