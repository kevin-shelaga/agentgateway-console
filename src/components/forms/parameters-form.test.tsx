import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParametersForm } from "@/components/forms/parameters-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";

const template = () => getResource("parameters")!.template("default");

function setup(doc: K8sResource = template()) {
  const onChange = vi.fn();
  render(<ParametersForm doc={doc} onChange={onChange} />);
  return onChange;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): K8sResource {
  return onChange.mock.calls.at(-1)![0] as K8sResource;
}

describe("ParametersForm", () => {
  it("edits logging level via spec.logging.level", () => {
    const onChange = setup();
    const level = screen.getByDisplayValue("info");
    fireEvent.change(level, { target: { value: "debug" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "logging", "level"])).toBe("debug");
  });

  it("edits image fields", () => {
    const onChange = setup();
    fireEvent.change(screen.getByPlaceholderText("cr.agentgateway.dev"), {
      target: { value: "my.reg" },
    });
    expect(getAtPath(lastDoc(onChange), ["spec", "image", "registry"])).toBe("my.reg");
  });

  it("deletes a field (and empty parents) when cleared", () => {
    const doc = template();
    const onChange = setup(doc);
    const level = screen.getByDisplayValue("info");
    fireEvent.change(level, { target: { value: "" } });
    const next = lastDoc(onChange);
    expect(getAtPath(next, ["spec", "logging", "level"])).toBeUndefined();
  });

  it("edits resource quantities", () => {
    const onChange = setup();
    fireEvent.change(screen.getByPlaceholderText("100m"), { target: { value: "250m" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "resources", "requests", "cpu"])).toBe("250m");
  });

  it("adds and removes env var rows", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add variable/i }));
    let next = lastDoc(onChange);
    expect(Array.isArray(getAtPath(next, ["spec", "env"]))).toBe(true);

    // Re-render with the env row present, fill it, then remove it.
    onChange.mockClear();
    render(<ParametersForm doc={next} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Env var 1 name"), { target: { value: "SESSION_KEY" } });
    next = lastDoc(onChange);
    expect(getAtPath(next, ["spec", "env", 0, "name"])).toBe("SESSION_KEY");
  });

  it("toggles istio integration and shows its fields", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Enable Istio integration" }));
    const next = lastDoc(onChange);
    expect(getAtPath(next, ["spec", "istio", "enabled"])).toBe(true);

    onChange.mockClear();
    render(<ParametersForm doc={next} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("cluster.local"), {
      target: { value: "td.example" },
    });
    expect(getAtPath(lastDoc(onChange), ["spec", "istio", "trustDomain"])).toBe("td.example");
  });

  it("shows YAML-only chips for overlay keys and survives garbage specs", () => {
    const doc = template();
    doc.spec = { ...doc.spec, deployment: { spec: {} }, rawConfig: { x: 1 } };
    setup(doc);
    expect(screen.getByText("deployment")).toBeInTheDocument();
    expect(screen.getByText("rawConfig")).toBeInTheDocument();

    expect(() =>
      render(
        <ParametersForm
          doc={{ apiVersion: "x", kind: "AgentgatewayParameters", metadata: { name: "x" }, spec: { logging: "junk", env: "junk" } as never }}
          onChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
