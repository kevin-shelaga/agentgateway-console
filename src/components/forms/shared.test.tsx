import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FormSection,
  numberOrUndefined,
  RemoveRowButton,
  StringListEditor,
} from "@/components/forms/shared";

describe("FormSection", () => {
  it("renders title, description, actions and children", () => {
    render(
      <FormSection
        title="Listeners"
        description="Ports and protocols."
        actions={<button type="button">Add listener</button>}
      >
        <p>child content</p>
      </FormSection>,
    );
    expect(screen.getByText("Listeners")).toBeInTheDocument();
    expect(screen.getByText("Ports and protocols.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add listener" })).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});

describe("StringListEditor", () => {
  function setup(values: string[] = []) {
    const onChange = vi.fn();
    render(<StringListEditor values={values} onChange={onChange} placeholder="hostname" />);
    return onChange;
  }

  it("adds a trimmed value with Enter", () => {
    const onChange = setup(["a.example.com"]);
    const input = screen.getByPlaceholderText("hostname");
    fireEvent.change(input, { target: { value: "  b.example.com  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["a.example.com", "b.example.com"]);
  });

  it("adds a value with the add button", () => {
    const onChange = setup([]);
    fireEvent.change(screen.getByPlaceholderText("hostname"), {
      target: { value: "c.example.com" },
    });
    // The add button is the only button when there are no chips to remove.
    fireEvent.click(screen.getByRole("button"));
    expect(onChange).toHaveBeenCalledWith(["c.example.com"]);
  });

  it("dedupes: re-adding an existing value is a no-op", () => {
    const onChange = setup(["dup"]);
    const input = screen.getByPlaceholderText("hostname");
    fireEvent.change(input, { target: { value: "dup" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores empty/whitespace drafts", () => {
    const onChange = setup([]);
    const input = screen.getByPlaceholderText("hostname");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a value via its chip button", () => {
    const onChange = setup(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });
});

describe("RemoveRowButton", () => {
  it("fires onClick and exposes the aria-label", () => {
    const onClick = vi.fn();
    render(<RemoveRowButton onClick={onClick} label="Remove row 1" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove row 1" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("numberOrUndefined", () => {
  it("parses finite numbers", () => {
    expect(numberOrUndefined("8080")).toBe(8080);
    expect(numberOrUndefined("0")).toBe(0);
    expect(numberOrUndefined("1.5")).toBe(1.5);
  });

  it("returns undefined for empty or whitespace input", () => {
    expect(numberOrUndefined("")).toBeUndefined();
    expect(numberOrUndefined("   ")).toBeUndefined();
  });

  it("returns undefined for non-numeric input", () => {
    expect(numberOrUndefined("abc")).toBeUndefined();
    expect(numberOrUndefined("Infinity")).toBeUndefined();
  });
});
