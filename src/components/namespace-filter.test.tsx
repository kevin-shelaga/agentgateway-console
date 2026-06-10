import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NamespaceFilter } from "@/components/namespace-filter";
import { namespaceList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

// Node 22+ exposes a non-functional window.localStorage (requires --localstorage-file);
// api-client reads the stored kube context from it on every request, so give it a real one.
const __store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => __store.get(k) ?? null,
  setItem: (k: string, v: string) => void __store.set(k, v),
  removeItem: (k: string) => void __store.delete(k),
  clear: () => __store.clear(),
});


describe("NamespaceFilter", () => {
  it("lists 'All namespaces' plus every namespace from useNamespaces", async () => {
    mockResourceLists({ namespaces: namespaceList });
    const onChange = vi.fn();
    renderWithProviders(<NamespaceFilter value={undefined} onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "All namespaces" })).toBeInTheDocument();
    for (const ns of ["default", "agents", "agentgateway-system"]) {
      expect(screen.getByRole("option", { name: ns })).toBeInTheDocument();
    }
  });

  it("calls onChange with the selected namespace", async () => {
    mockResourceLists({ namespaces: namespaceList });
    const onChange = vi.fn();
    renderWithProviders(<NamespaceFilter value={undefined} onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "agents" }));
    expect(onChange).toHaveBeenCalledWith("agents");
  });

  it("maps the 'All namespaces' sentinel back to undefined", async () => {
    mockResourceLists({ namespaces: namespaceList });
    const onChange = vi.fn();
    renderWithProviders(<NamespaceFilter value="agents" onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "All namespaces" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
