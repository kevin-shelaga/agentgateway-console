import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TlsRouteForm } from "@/components/forms/tlsroute-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { gateway } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const template = () => getResource("tlsroutes")!.template("default");

function setup(doc: K8sResource = template()) {
  const onChange = vi.fn();
  mockResourceLists({ gateways: [gateway], services: [] });
  renderWithProviders(<TlsRouteForm doc={doc} onChange={onChange} />);
  return onChange;
}

describe("TlsRouteForm", () => {
  it("renders parents, hostnames, and rules from the template", () => {
    setup();
    expect(screen.getByText("secure.example.com")).toBeInTheDocument();
    expect(screen.getByText("Rule 1")).toBeInTheDocument();
  });

  it("adds a hostname chip into spec.hostnames", () => {
    const onChange = setup();
    const input = screen.getByPlaceholderText("secure.example.com");
    fireEvent.change(input, { target: { value: "alt.example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect(getAtPath(next, ["spec", "hostnames"])).toEqual([
      "secure.example.com",
      "alt.example.com",
    ]);
  });

  it("adds and removes rules and survives garbage specs", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add rule/ }));
    let next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect((getAtPath(next, ["spec", "rules"]) as unknown[])).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove rule 1" }));
    next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect((getAtPath(next, ["spec", "rules"]) as unknown[])).toHaveLength(0);

    expect(() =>
      renderWithProviders(
        <TlsRouteForm
          doc={{ apiVersion: "x", kind: "TLSRoute", metadata: { name: "x" }, spec: { rules: 5, hostnames: {} } as never }}
          onChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
