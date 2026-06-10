import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatewayClassForm } from "@/components/forms/gatewayclass-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { namespaceList, parameters } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const desc = getResource("gatewayclasses")!;

function withParamsRef(): K8sResource {
  const doc = desc.template("default");
  (doc.spec as Record<string, unknown>).parametersRef = {
    group: "agentgateway.dev",
    kind: "AgentgatewayParameters",
    name: "",
  };
  return doc;
}

function setup(doc: K8sResource = desc.template("default")) {
  mockResourceLists({ agentgatewayparameters: [parameters], namespaces: namespaceList });
  const onChange = vi.fn();
  renderWithProviders(<GatewayClassForm doc={doc} onChange={onChange} />);
  return onChange;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): K8sResource {
  return onChange.mock.calls.at(-1)![0] as K8sResource;
}

describe("GatewayClassForm controller", () => {
  it("edits spec.controllerName", () => {
    const onChange = setup();
    fireEvent.change(screen.getByDisplayValue("agentgateway.dev/agentgateway"), {
      target: { value: "example.com/controller" },
    });
    expect(getAtPath(lastDoc(onChange), ["spec", "controllerName"])).toBe(
      "example.com/controller",
    );
  });

  it("sets and deletes the optional description", () => {
    const onChange = setup();
    const input = screen.getByPlaceholderText("Human-readable description");
    fireEvent.change(input, { target: { value: "prod gateways" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "description"])).toBe("prod gateways");

    const doc = desc.template("default");
    (doc.spec as Record<string, unknown>).description = "old";
    const onChange2 = setup(doc);
    fireEvent.change(screen.getByDisplayValue("old"), { target: { value: "" } });
    expect(getAtPath(lastDoc(onChange2), ["spec", "description"])).toBeUndefined();
  });
});

describe("GatewayClassForm parametersRef", () => {
  it("toggling on seeds a pinned AgentgatewayParameters ref", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Reference parameters" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "parametersRef"])).toEqual({
      group: "agentgateway.dev",
      kind: "AgentgatewayParameters",
      name: "",
    });
  });

  it("toggling off deletes spec.parametersRef", () => {
    const onChange = setup(withParamsRef());
    fireEvent.click(screen.getByRole("switch", { name: "Reference parameters" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "parametersRef"])).toBeUndefined();
  });

  it("picking a parameters resource keeps group/kind pinned", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup(withParamsRef());
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "agw-params" }));
    const ref = getAtPath(lastDoc(onChange), ["spec", "parametersRef"]) as Record<string, unknown>;
    expect(ref).toEqual({
      group: "agentgateway.dev",
      kind: "AgentgatewayParameters",
      name: "agw-params",
    });
  });

  it("sets and clears the ref namespace", () => {
    const onChange = setup(withParamsRef());
    const nsInput = screen.getByPlaceholderText("agentgateway-system");
    fireEvent.change(nsInput, { target: { value: "infra" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "parametersRef", "namespace"])).toBe("infra");
  });
});
