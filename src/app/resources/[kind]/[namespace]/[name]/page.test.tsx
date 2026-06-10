import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResourceDetailPage from "@/app/resources/[kind]/[namespace]/[name]/page";
import { gateway, httpRoute } from "@/test/fixtures";
import { mockFetch, renderWithProviders, resolvedParams } from "@/test/utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => "/resources/gateways/agentgateway-system/api-agentgateway",
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/components/yaml-editor", () => ({
  YamlEditor: (p: { value: string }) => <textarea readOnly value={p.value} data-testid="yaml" />,
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


function mockDetailRoutes() {
  return mockFetch([
    { match: "/httproutes", body: { items: [httpRoute] } },
    { match: "/grpcroutes", body: { items: [] } },
    { match: "/agentgatewaypolicies", body: { items: [] } },
    { match: "/gateways", body: { items: [gateway] } },
    { match: "/gateways/agentgateway-system/api-agentgateway", body: gateway },
    { match: "/api/cluster", body: { connected: true, context: "test-ctx" } },
  ]);
}

function renderPage() {
  return renderWithProviders(
    <Suspense fallback={null}>
      <ResourceDetailPage
        params={resolvedParams({
          kind: "gateways",
          namespace: "agentgateway-system",
          name: "api-agentgateway",
        })}
      />
    </Suspense>,
  );
}

describe("ResourceDetailPage", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("renders breadcrumb, metadata, and conditions on the overview tab", async () => {
    mockDetailRoutes();
    renderPage();

    expect(await screen.findByRole("heading", { name: /api-agentgateway/ })).toBeInTheDocument();
    // Metadata card
    expect(await screen.findByText("gateway.networking.k8s.io/v1 · Gateway")).toBeInTheDocument();
    expect(screen.getByText("Kind")).toBeInTheDocument();
    expect(screen.getAllByText(/ago$/).length).toBeGreaterThan(0);

    // Conditions: top-level plus listener-scoped
    const conditions = screen.getByText("Conditions").closest('[data-slot="card"]') as HTMLElement;
    expect(within(conditions).getByText("Accepted")).toBeInTheDocument();
    expect(within(conditions).getByText("Programmed")).toBeInTheDocument();
    expect(within(conditions).getByText("listener/http")).toBeInTheDocument();
    expect(within(conditions).getByText("listener/https")).toBeInTheDocument();

    // Related resources joined from cached lists
    expect(await screen.findByText("Related resources")).toBeInTheDocument();
    expect(screen.getByText("references this as parent")).toBeInTheDocument();
  });

  it("shows the YAML in the YAML tab", async () => {
    mockDetailRoutes();
    renderPage();
    await screen.findByText("gateway.networking.k8s.io/v1 · Gateway");

    await userEvent.click(screen.getByRole("tab", { name: "YAML" }));
    const yaml = (await screen.findByTestId("yaml")) as HTMLTextAreaElement;
    expect(yaml.value).toContain("name: api-agentgateway");
    expect(yaml.value).toContain("kind: Gateway");
  });

  it("deletes the resource and navigates back to the list", async () => {
    const fetchSpy = mockDetailRoutes();
    renderPage();
    await screen.findByText("gateway.networking.k8s.io/v1 · Gateway");

    await userEvent.click(screen.getByRole("button", { name: /Delete/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete Gateway?")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    const deleteCall = fetchSpy.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall![0])).toContain("/gateways/agentgateway-system/api-agentgateway");
    expect(toast.success).toHaveBeenCalledWith("Gateway api-agentgateway deleted");
    expect(push).toHaveBeenCalledWith("/resources/gateways");
  });

  it("renders a resource error for 4xx failures", async () => {
    mockFetch([
      { match: "/httproutes", body: { items: [] } },
      { match: "/grpcroutes", body: { items: [] } },
      { match: "/agentgatewaypolicies", body: { items: [] } },
      { match: "/gateways", body: { items: [] } },
      {
        match: "/gateways/agentgateway-system/api-agentgateway",
        body: { error: { status: 404, reason: "NotFound", message: "gateway not found", causes: [] } },
        status: 404,
      },
    ]);
    renderPage();
    expect(await screen.findByText("NotFound (404)")).toBeInTheDocument();
    expect(screen.getByText("gateway not found")).toBeInTheDocument();
  });
});
