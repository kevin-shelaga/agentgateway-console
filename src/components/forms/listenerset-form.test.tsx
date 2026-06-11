import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListenerSetForm } from "@/components/forms/listenerset-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { gateway } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const template = () => getResource("listenersets")!.template("default");

function setup(doc: K8sResource = template()) {
  const onChange = vi.fn();
  mockResourceLists({ gateways: [gateway] });
  renderWithProviders(<ListenerSetForm doc={doc} onChange={onChange} />);
  return onChange;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): K8sResource {
  return onChange.mock.calls.at(-1)![0] as K8sResource;
}

describe("ListenerSetForm", () => {
  it("edits listener fields at the right spec paths", () => {
    const onChange = setup();
    fireEvent.change(screen.getByPlaceholderText("extra-http"), { target: { value: "metrics" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "listeners", 0, "name"])).toBe("metrics");
  });

  it("adds and removes listener rows", () => {
    const doc = template();
    const onChange = setup(doc);
    fireEvent.click(screen.getByRole("button", { name: /Add listener/ }));
    expect((getAtPath(lastDoc(onChange), ["spec", "listeners"]) as unknown[])).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove listener 1" }));
    expect((getAtPath(lastDoc(onChange), ["spec", "listeners"]) as unknown[])).toHaveLength(0);
  });

  it("survives garbage specs and flags YAML-only TLS", () => {
    const doc = template();
    (doc.spec as Record<string, unknown>).listeners = [
      { name: "https", protocol: "HTTPS", port: 443, tls: { mode: "Terminate" } },
    ];
    expect(() => setup(doc)).not.toThrow();
    expect(screen.getByText(/TLS for this listener is configured in YAML/)).toBeInTheDocument();

    expect(() =>
      renderWithProviders(
        <ListenerSetForm
          doc={{ apiVersion: "x", kind: "ListenerSet", metadata: { name: "x" }, spec: { listeners: "junk", parentRef: 5 } as never }}
          onChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
