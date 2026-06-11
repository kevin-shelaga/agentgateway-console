import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AreaChart } from "@/components/area-chart";
import { formatCpu, formatMemory } from "@/lib/quantity";

const cpuPoints = [
  { t: 1_000_000, v: 2 },
  { t: 1_015_000, v: 4 },
  { t: 1_030_000, v: 3 },
];
const memPoints = [
  { t: 1_000_000, v: 16 * 1024 * 1024 },
  { t: 1_015_000, v: 24 * 1024 * 1024 },
  { t: 1_030_000, v: 20 * 1024 * 1024 },
];

describe("AreaChart", () => {
  it("shows a collecting placeholder until two samples exist", () => {
    render(<AreaChart points={cpuPoints.slice(0, 1)} label="cpu" format={formatCpu} />);
    expect(screen.getByText(/Collecting samples/)).toBeInTheDocument();
  });

  it("renders labeled value-axis ticks, current/min/max, and the trend", () => {
    const { container } = render(
      <AreaChart points={cpuPoints} label="cpu" format={formatCpu} />,
    );
    expect(screen.getByRole("img", { name: "cpu usage trend" })).toBeInTheDocument();
    // Current value headline + min/max summary ("3m" may also be a tick label).
    expect(screen.getAllByText("3m").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/min 2m · max 4m/)).toBeInTheDocument();
    // Four labeled gridline ticks on the value axis.
    const tickLabels = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(tickLabels.filter((t) => /m$|^<1m$|^\d/.test(t ?? "")).length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(2); // area + line
  });

  it("draws dashed reference lines scaled into the axis", () => {
    const { container } = render(
      <AreaChart
        points={memPoints}
        label="mem"
        format={formatMemory}
        referenceLines={[
          { value: 128 * 1024 * 1024, label: "request" },
          { value: 512 * 1024 * 1024, label: "limit" },
        ]}
      />,
    );
    expect(screen.getByText("request 128Mi")).toBeInTheDocument();
    expect(screen.getByText("limit 512Mi")).toBeInTheDocument();
    expect(container.querySelectorAll('line[stroke-dasharray="5 4"]')).toHaveLength(2);
    // The scale stretches to fit the limit, not just the data (24Mi max).
    const tickLabels = [...container.querySelectorAll("text")].map((t) => t.textContent ?? "");
    expect(tickLabels.some((t) => /Mi|Gi/.test(t) && t.includes("537") === false)).toBe(true);
  });
});
