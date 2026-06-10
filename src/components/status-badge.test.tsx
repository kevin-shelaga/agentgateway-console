import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/status-badge";
import type { HealthState } from "@/lib/types";

const CASES: Array<{ state: HealthState; dot: string; text: string }> = [
  { state: "Healthy", dot: "status-dot-healthy", text: "text-success" },
  { state: "Degraded", dot: "status-dot-degraded", text: "text-destructive" },
  { state: "Pending", dot: "status-dot-pending", text: "text-warning" },
  { state: "Unknown", dot: "status-dot-unknown", text: "text-muted-foreground" },
];

describe("StatusBadge", () => {
  it.each(CASES)("renders $state with the right dot and text classes", ({ state, dot, text }) => {
    const { container } = render(<StatusBadge state={state} />);
    expect(screen.getByText(state)).toHaveClass(text);
    expect(container.querySelector(`.status-dot.${dot}`)).toBeInTheDocument();
  });

  it("renders a custom label instead of the state name", () => {
    render(<StatusBadge state="Healthy" label="All good" />);
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("merges a custom className onto the wrapper", () => {
    const { container } = render(<StatusBadge state="Pending" className="ml-2" />);
    expect(container.firstElementChild).toHaveClass("ml-2");
  });
});
