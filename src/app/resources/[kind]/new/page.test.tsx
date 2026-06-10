import { screen } from "@testing-library/react";
import { Component, Suspense, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import NewResourcePage from "@/app/resources/[kind]/new/page";
import { namespaceList, secretList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders, resolvedParams } from "@/test/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/resources/backends/new",
  notFound: () => {
    throw new Error("notFound");
  },
}));

vi.mock("@/components/yaml-editor", () => ({
  YamlEditor: ({ value }: { value: string }) => <textarea readOnly value={value} data-testid="yaml" />,
}));

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <div data-testid="boundary" /> : this.props.children;
  }
}

function renderPage(kind: string) {
  mockResourceLists({ namespaces: namespaceList, secrets: secretList, services: [] });
  return renderWithProviders(
    <Boundary>
      <Suspense fallback={null}>
        <NewResourcePage params={resolvedParams({ kind })} />
      </Suspense>
    </Boundary>,
  );
}

describe("NewResourcePage", () => {
  it("renders the editor seeded with the kind's template", async () => {
    renderPage("backends");
    expect(await screen.findByRole("heading", { name: /Create Backend/ })).toBeInTheDocument();
    const yaml = screen.getByTestId("yaml") as HTMLTextAreaElement;
    expect(yaml.value).toContain("kind: AgentgatewayBackend");
    expect(yaml.value).toContain("gpt-4o-mini");
    // The guided Backend form is wired in.
    expect(screen.getByText("Backend type")).toBeInTheDocument();
  });

  it("throws notFound for unknown or read-only kinds", async () => {
    renderPage("secrets");
    expect(await screen.findByTestId("boundary")).toBeInTheDocument();
  });
});
