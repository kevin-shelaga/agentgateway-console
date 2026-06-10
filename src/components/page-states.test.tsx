import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ClusterUnreachable,
  EmptyState,
  PageHeader,
  ResourceError,
  TableSkeleton,
} from "@/components/page-states";
import { getResource } from "@/lib/registry";
import type { ResourceDescriptor } from "@/lib/types";

describe("PageHeader", () => {
  it("renders title, description, and action children", () => {
    render(
      <PageHeader title="Gateways" description="Traffic entry points">
        <button>Create</button>
      </PageHeader>,
    );
    expect(screen.getByRole("heading", { name: "Gateways" })).toBeInTheDocument();
    expect(screen.getByText("Traffic entry points")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("omits the description paragraph when not provided", () => {
    const { container } = render(<PageHeader title="Plain" />);
    expect(container.querySelector("p")).not.toBeInTheDocument();
  });
});

describe("ClusterUnreachable", () => {
  it("shows a custom error message", () => {
    render(<ClusterUnreachable error="connection refused to 10.0.0.1" />);
    expect(screen.getByText("Cluster unreachable")).toBeInTheDocument();
    expect(screen.getByText("connection refused to 10.0.0.1")).toBeInTheDocument();
  });

  it("falls back to the default kubeconfig hint", () => {
    render(<ClusterUnreachable />);
    expect(
      screen.getByText(/Check your kubeconfig, VPN, or selected context/),
    ).toBeInTheDocument();
  });
});

describe("ResourceError", () => {
  it("renders reason, status code, and message", () => {
    render(
      <ResourceError
        error={{ status: 403, reason: "Forbidden", message: "RBAC denied", causes: [] }}
      />,
    );
    expect(screen.getByText("Forbidden (403)")).toBeInTheDocument();
    expect(screen.getByText("RBAC denied")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  const desc = getResource("gateways")!;

  it("renders the empty copy and a create CTA linking to the new page", () => {
    render(<EmptyState desc={desc} />);
    expect(screen.getByText("No gateways yet")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Create Gateway/ });
    expect(cta).toHaveAttribute("href", "/resources/gateways/new");
  });

  it("hides the create CTA for read-only descriptors", () => {
    const readOnly: ResourceDescriptor = { ...desc, readOnly: true };
    render(<EmptyState desc={readOnly} />);
    expect(screen.getByText("No gateways yet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("TableSkeleton", () => {
  it("renders six skeleton rows", () => {
    const { container } = render(<TableSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
  });
});
