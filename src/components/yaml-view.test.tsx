import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { YamlView } from "@/components/yaml-view";

vi.mock("@/components/yaml-editor", () => ({
  YamlEditor: (p: { value: string }) => <textarea readOnly value={p.value} data-testid="yaml" />,
}));

const YAML = "kind: Gateway\nmetadata:\n  name: api-agentgateway\n";

describe("YamlView", () => {
  it("renders the YAML read-only", () => {
    render(<YamlView yaml={YAML} />);
    expect(screen.getByTestId("yaml")).toHaveValue(YAML);
  });

  it("copies to the clipboard and flips the icon while copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<YamlView yaml={YAML} />);
    const button = screen.getByRole("button", { name: "Copy YAML" });
    expect(button.querySelector("svg.text-success")).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(writeText).toHaveBeenCalledWith(YAML);
    await waitFor(() => expect(button.querySelector("svg.text-success")).toBeInTheDocument());
  });

  it("reverts to the copy icon after 1.5s", async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });

      render(<YamlView yaml={YAML} />);
      const button = screen.getByRole("button", { name: "Copy YAML" });
      // fireEvent (sync) instead of userEvent: user-event's pointer system
      // deadlocks under fake timers.
      await act(async () => {
        fireEvent.click(button);
      });
      expect(button.querySelector("svg.text-success")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600);
      });
      expect(button.querySelector("svg.text-success")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
