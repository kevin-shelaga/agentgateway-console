import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ValidationPanel } from "@/components/editor/validation-panel";
import type { ParsedK8sError } from "@/lib/k8s/errors";
import type { ValidationIssue } from "@/lib/validation";

function issues(n: number): ValidationIssue[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `spec.field${i}`,
    message: `problem ${i}`,
  }));
}

describe("ValidationPanel", () => {
  it("renders nothing when there is nothing to report", () => {
    const { container } = render(
      <ValidationPanel schemaIssues={[]} dryRunError={null} dryRunOk={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists schema issues with their paths", () => {
    render(
      <ValidationPanel
        schemaIssues={[{ path: "spec.port", message: "must be integer" }]}
        dryRunError={null}
        dryRunOk={false}
      />,
    );
    expect(screen.getByText("Schema validation (1)")).toBeInTheDocument();
    expect(screen.getByText("spec.port")).toBeInTheDocument();
    expect(screen.getByText(/must be integer/)).toBeInTheDocument();
  });

  it("truncates schema issues at 8 and summarizes the rest", () => {
    render(<ValidationPanel schemaIssues={issues(10)} dryRunError={null} dryRunOk={false} />);
    expect(screen.getByText("Schema validation (10)")).toBeInTheDocument();
    expect(screen.getByText(/problem 7/)).toBeInTheDocument();
    expect(screen.queryByText(/problem 8/)).not.toBeInTheDocument();
    expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
  });

  it("renders dry-run error causes with their fields", () => {
    const err: ParsedK8sError = {
      status: 422,
      reason: "Invalid",
      message: "Gateway is invalid",
      causes: [
        { field: "spec.listeners", message: "Required value" },
        { field: "spec.gatewayClassName", message: "Unsupported value" },
      ],
    };
    render(<ValidationPanel schemaIssues={[]} dryRunError={err} dryRunOk={false} />);
    expect(screen.getByText(/Rejected by the API server/)).toBeInTheDocument();
    expect(screen.getByText("spec.listeners")).toBeInTheDocument();
    expect(screen.getByText(/Required value/)).toBeInTheDocument();
    expect(screen.getByText("spec.gatewayClassName")).toBeInTheDocument();
    // Top-level message is hidden when causes exist.
    expect(screen.queryByText("Gateway is invalid")).not.toBeInTheDocument();
  });

  it("falls back to the error message when there are no causes", () => {
    const err: ParsedK8sError = {
      status: 409,
      reason: "AlreadyExists",
      message: "gateways.gateway.networking.k8s.io \"x\" already exists",
      causes: [],
    };
    render(<ValidationPanel schemaIssues={[]} dryRunError={err} dryRunOk={false} />);
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
  });

  it("shows the dry-run success line", () => {
    render(<ValidationPanel schemaIssues={[]} dryRunError={null} dryRunOk />);
    expect(screen.getByText(/Dry-run passed/)).toBeInTheDocument();
  });

  it("can show schema issues and a dry-run verdict together", () => {
    render(<ValidationPanel schemaIssues={issues(1)} dryRunError={null} dryRunOk />);
    expect(screen.getByText("Schema validation (1)")).toBeInTheDocument();
    expect(screen.getByText(/Dry-run passed/)).toBeInTheDocument();
  });
});
