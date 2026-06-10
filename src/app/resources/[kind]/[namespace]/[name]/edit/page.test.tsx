import { screen } from "@testing-library/react";
import { Component, Suspense, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import EditResourcePage from "@/app/resources/[kind]/[namespace]/[name]/edit/page";
import { aiBackend, namespaceList, secretList } from "@/test/fixtures";
import { mockFetch, renderWithProviders, resolvedParams } from "@/test/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/resources/backends/agents/openai-backend/edit",
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

function renderPage(kind: string, namespace: string, name: string) {
  mockFetch([
    { match: `/agentgatewaybackends/${namespace}/${name}`, body: aiBackend },
    { match: "/namespaces", body: { items: namespaceList } },
    { match: "/secrets", body: { items: secretList } },
    { match: "/api/schemas/", body: { versions: {}, source: "bundled" } },
  ]);
  return renderWithProviders(
    <Boundary>
      <Suspense fallback={null}>
        <EditResourcePage params={resolvedParams({ kind, namespace, name })} />
      </Suspense>
    </Boundary>,
  );
}

describe("EditResourcePage", () => {
  it("loads the resource and seeds the editor without server-managed fields", async () => {
    renderPage("backends", "agents", "openai-backend");
    expect(
      await screen.findByRole("heading", { name: /Edit openai-backend/ }),
    ).toBeInTheDocument();

    const yaml = (await screen.findByTestId("yaml")) as HTMLTextAreaElement;
    expect(yaml.value).toContain("name: openai-backend");
    expect(yaml.value).toContain("resourceVersion");
    expect(yaml.value).not.toContain("status:");
    expect(yaml.value).not.toContain("creationTimestamp");

    // Name is immutable on update.
    expect(screen.getByDisplayValue("openai-backend")).toBeDisabled();
  });

  it("throws notFound for unknown kinds", async () => {
    renderPage("definitely-not", "agents", "x");
    expect(await screen.findByTestId("boundary")).toBeInTheDocument();
  });
});
