import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

const setTheme = vi.fn();
let resolvedTheme = "dark";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme, setTheme }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    setTheme.mockClear();
  });

  it("switches dark → light", async () => {
    resolvedTheme = "dark";
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("switches light → dark", async () => {
    resolvedTheme = "light";
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
