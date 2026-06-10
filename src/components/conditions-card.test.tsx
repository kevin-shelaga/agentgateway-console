import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConditionsCard } from "@/components/conditions-card";
import type { ScopedCondition } from "@/lib/types";

function dotFor(container: HTMLElement, text: string): Element | null {
  const li = screen.getByText(text).closest("li");
  return li?.querySelector(".status-dot") ?? null;
}

describe("ConditionsCard", () => {
  it("shows the empty state when there are no conditions", () => {
    render(<ConditionsCard conditions={[]} />);
    expect(screen.getByText("No conditions reported.")).toBeInTheDocument();
  });

  it("renders healthy, failing, and unknown dots by status", () => {
    const conditions: ScopedCondition[] = [
      { type: "Accepted", status: "True" },
      { type: "ResolvedRefs", status: "False", message: "backend not found" },
      { type: "Programmed", status: "Unknown" },
    ];
    const { container } = render(<ConditionsCard conditions={conditions} />);
    expect(dotFor(container, "Accepted")).toHaveClass("status-dot-healthy");
    expect(dotFor(container, "ResolvedRefs")).toHaveClass("status-dot-degraded");
    expect(dotFor(container, "Programmed")).toHaveClass("status-dot-pending");
    expect(screen.getByText("backend not found")).toBeInTheDocument();
  });

  it("treats negative-polarity conditions as degraded when True and healthy when False", () => {
    const conditions: ScopedCondition[] = [
      { type: "Conflicted", status: "True", message: "listener conflict" },
      { type: "OverlappingTLSConfig", status: "False" },
    ];
    const { container } = render(<ConditionsCard conditions={conditions} />);
    expect(dotFor(container, "Conflicted")).toHaveClass("status-dot-degraded");
    expect(dotFor(container, "OverlappingTLSConfig")).toHaveClass("status-dot-healthy");
  });

  it("renders scope, distinct reason, and relative transition time", () => {
    const conditions: ScopedCondition[] = [
      {
        type: "ResolvedRefs",
        status: "True",
        scope: "listener/https",
        reason: "RefsResolved",
        lastTransitionTime: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
    ];
    render(<ConditionsCard conditions={conditions} />);
    expect(screen.getByText("listener/https")).toBeInTheDocument();
    expect(screen.getByText("RefsResolved")).toBeInTheDocument();
    expect(screen.getByText("5m ago")).toBeInTheDocument();
  });

  it("hides the reason when it duplicates the condition type", () => {
    render(<ConditionsCard conditions={[{ type: "Accepted", status: "True", reason: "Accepted" }]} />);
    expect(screen.getAllByText("Accepted")).toHaveLength(1);
  });
});
