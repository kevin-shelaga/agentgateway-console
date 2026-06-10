import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "@/components/sparkline";

describe("Sparkline", () => {
  it("renders a dashed placeholder line with no samples", () => {
    const { container } = render(<Sparkline samples={[]} />);
    const line = container.querySelector("line");
    expect(line).toBeInTheDocument();
    expect(line).toHaveAttribute("stroke-dasharray", "2 3");
    expect(container.querySelector("polyline")).not.toBeInTheDocument();
  });

  it("renders the placeholder for a single sample too", () => {
    const { container } = render(<Sparkline samples={[42]} />);
    expect(container.querySelector("line")).toBeInTheDocument();
    expect(container.querySelector("polyline")).not.toBeInTheDocument();
  });

  it("renders a polyline plus endpoint circle for two or more samples", () => {
    const { container } = render(<Sparkline samples={[1, 2, 3]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).toBeInTheDocument();
    expect(polyline?.getAttribute("points")?.split(" ")).toHaveLength(3);
    expect(container.querySelector("circle")).toBeInTheDocument();
    expect(container.querySelector("line")).not.toBeInTheDocument();
  });

  it("honors custom width/height and pins the endpoint circle to the right edge", () => {
    const { container } = render(<Sparkline samples={[0, 10]} width={100} height={30} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "100");
    expect(svg).toHaveAttribute("height", "30");
    expect(container.querySelector("circle")).toHaveAttribute("cx", "98");
  });
});
