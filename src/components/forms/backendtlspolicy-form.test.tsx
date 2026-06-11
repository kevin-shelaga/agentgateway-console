import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BackendTlsPolicyForm } from "@/components/forms/backendtlspolicy-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { serviceList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const template = () => getResource("backendtlspolicies")!.template("default");

function setup(doc: K8sResource = template()) {
  const onChange = vi.fn();
  mockResourceLists({ services: serviceList, agentgatewaybackends: [] });
  renderWithProviders(<BackendTlsPolicyForm doc={doc} onChange={onChange} />);
  return onChange;
}

describe("BackendTlsPolicyForm", () => {
  it("edits the verification hostname", () => {
    const onChange = setup();
    fireEvent.change(screen.getByPlaceholderText("my-service.example.com"), {
      target: { value: "api.internal" },
    });
    const next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect(getAtPath(next, ["spec", "validation", "hostname"])).toBe("api.internal");
  });

  it("switches target kind to AgentgatewayBackend with the right group", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup();
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "AgentgatewayBackend" }));
    const next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect(getAtPath(next, ["spec", "targetRefs", 0])).toMatchObject({
      group: "agentgateway.dev",
      kind: "AgentgatewayBackend",
    });
  });

  it("switching CA mode to custom refs clears wellKnownCACertificates", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup();
    await user.click(screen.getAllByRole("combobox").at(-1)!);
    await user.click(await screen.findByRole("option", { name: /Custom CA refs/ }));
    const next = onChange.mock.calls.at(-1)![0] as K8sResource;
    expect(getAtPath(next, ["spec", "validation", "wellKnownCACertificates"])).toBeUndefined();
    expect(getAtPath(next, ["spec", "validation", "caCertificateRefs"])).toEqual([]);
  });

  it("survives garbage specs", () => {
    expect(() =>
      renderWithProviders(
        <BackendTlsPolicyForm
          doc={{ apiVersion: "x", kind: "BackendTLSPolicy", metadata: { name: "x" }, spec: { targetRefs: "junk", validation: 7 } as never }}
          onChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
