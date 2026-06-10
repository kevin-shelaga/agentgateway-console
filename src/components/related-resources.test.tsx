import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RelatedResources } from "@/components/related-resources";
import { gateway, httpRoute, policy, staticBackend } from "@/test/fixtures";
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


describe("RelatedResources", () => {
  it("renders outgoing references with links and relations", async () => {
    mockResourceLists({ httproutes: [], grpcroutes: [], agentgatewaypolicies: [], gateways: [] });
    renderWithProviders(<RelatedResources res={gateway} />);

    // Gateway → GatewayClass (linkable) and TLS cert Secret (not linkable in console)
    const classLink = await screen.findByRole("link", { name: "agentgateway" });
    expect(classLink).toHaveAttribute("href", "/resources/gatewayclasses/_cluster/agentgateway");
    expect(screen.getByText("class")).toBeInTheDocument();
    expect(screen.getByText("Secret")).toBeInTheDocument();
    expect(screen.getByText("agentgateway-system/api-cert")).toBeInTheDocument();
    expect(screen.getByText("tls cert (https)")).toBeInTheDocument();
  });

  it("renders incoming references from cached route and policy lists", async () => {
    mockResourceLists({
      httproutes: [httpRoute],
      grpcroutes: [],
      agentgatewaypolicies: [policy],
      gateways: [gateway],
    });
    renderWithProviders(<RelatedResources res={gateway} />);

    const routeLink = await screen.findByRole("link", { name: "agents/chat-route" });
    expect(routeLink).toHaveAttribute("href", "/resources/httproutes/agents/chat-route");
    expect(screen.getByText("references this as parent")).toBeInTheDocument();

    const policyLink = screen.getByRole("link", { name: "agentgateway-system/cors-policy" });
    expect(policyLink).toHaveAttribute(
      "href",
      "/resources/policies/agentgateway-system/cors-policy",
    );
    expect(screen.getByText("references this as target")).toBeInTheDocument();
  });

  it("renders nothing when there are no outgoing or incoming references", () => {
    mockResourceLists({ httproutes: [], grpcroutes: [], agentgatewaypolicies: [], gateways: [] });
    const { container } = renderWithProviders(<RelatedResources res={staticBackend} />);
    expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
    expect(screen.queryByText("Related resources")).not.toBeInTheDocument();
  });
});
