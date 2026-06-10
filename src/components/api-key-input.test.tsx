import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiKeyInput } from "@/components/api-key-input";
import { TooltipProvider } from "@/components/ui/tooltip";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <TooltipProvider>
      <ApiKeyInput id="key" value={value} onChange={setValue} />
    </TooltipProvider>
  );
}

describe("ApiKeyInput", () => {
  it("starts masked and toggles visibility", () => {
    render(<Harness />);
    const input = document.getElementById("key") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    expect(input.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide key" }));
    expect(input.type).toBe("password");
  });

  it("generates a random key and reveals it for copying", () => {
    render(<Harness />);
    const input = document.getElementById("key") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: /Generate/ }));
    expect(input.value).toMatch(/^agc_[A-Za-z0-9]{40}$/);
    expect(input.type).toBe("text");

    const again = input.value;
    fireEvent.click(screen.getByRole("button", { name: /Generate/ }));
    expect(input.value).not.toBe(again);
  });

  it("copies the value to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Harness />);

    // Disabled while empty.
    expect(screen.getByRole("button", { name: "Copy key" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Generate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/^agc_[A-Za-z0-9]{40}$/),
    );
  });
});
