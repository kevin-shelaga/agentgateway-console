import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReferenceGrantForm } from "@/components/forms/referencegrant-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";

const template = () => getResource("referencegrants")!.template("default");

function setup(doc: K8sResource = template()) {
  const onChange = vi.fn();
  render(<ReferenceGrantForm doc={doc} onChange={onChange} />);
  return onChange;
}

describe("ReferenceGrantForm", () => {
  it("edits the source namespace", () => {
    const onChange = setup();
    fireEvent.change(screen.getByPlaceholderText("default"), { target: { value: "apps" } });
    const next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect(getAtPath(next, ["spec", "from", 0, "namespace"])).toBe("apps");
  });

  it("adds source and target rows with their groups", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add source/ }));
    let next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect(getAtPath(next, ["spec", "from", 1])).toMatchObject({
      group: "gateway.networking.k8s.io",
      kind: "HTTPRoute",
    });

    fireEvent.click(screen.getByRole("button", { name: /Add target/ }));
    next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect(getAtPath(next, ["spec", "to", 1])).toMatchObject({ group: "", kind: "Service" });
  });

  it("sets an optional target name and deletes it when cleared", () => {
    const onChange = setup();
    const nameInput = screen.getByPlaceholderText("any");
    fireEvent.change(nameInput, { target: { value: "my-svc" } });
    let next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect(getAtPath(next, ["spec", "to", 0, "name"])).toBe("my-svc");
  });

  it("survives garbage specs", () => {
    expect(() =>
      render(
        <ReferenceGrantForm
          doc={{ apiVersion: "x", kind: "ReferenceGrant", metadata: { name: "x" }, spec: { from: "junk", to: null } as never }}
          onChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
