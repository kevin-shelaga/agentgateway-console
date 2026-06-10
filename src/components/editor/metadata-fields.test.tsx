import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MetadataFields } from "@/components/editor/metadata-fields";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { namespaceList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const gateways = getResource("gateways")!;
const gatewayclasses = getResource("gatewayclasses")!;

function doc(overrides: Partial<K8sResource["metadata"]> = {}): K8sResource {
  return {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "Gateway",
    metadata: { name: "my-gateway", namespace: "default", ...overrides },
    spec: {},
  };
}

function setup(
  ui: { doc?: K8sResource; mode?: "create" | "update"; desc?: typeof gateways } = {},
) {
  mockResourceLists({ namespaces: namespaceList });
  const onChange = vi.fn();
  renderWithProviders(
    <MetadataFields
      desc={ui.desc ?? gateways}
      doc={ui.doc ?? doc()}
      mode={ui.mode ?? "create"}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("MetadataFields name", () => {
  it("updates the doc when the name changes", () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "new-name" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getAtPath(onChange.mock.calls[0][0], ["metadata", "name"])).toBe("new-name");
  });

  it("disables name and namespace in update mode", () => {
    setup({ mode: "update" });
    expect(screen.getByLabelText("Name")).toBeDisabled();
    // Namespace renders as a disabled input (not a select) in update mode.
    expect(screen.getByDisplayValue("default")).toBeDisabled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("MetadataFields namespace select (create)", () => {
  it("lists namespaces from the cluster and updates the doc", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup();

    await user.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: "agents" });
    await user.click(option);

    expect(getAtPath(onChange.mock.calls.at(-1)![0], ["metadata", "namespace"])).toBe("agents");
  });

  it("omits the namespace field for cluster-scoped kinds", () => {
    setup({
      desc: gatewayclasses,
      doc: {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "GatewayClass",
        metadata: { name: "agentgateway" },
        spec: {},
      },
    });
    expect(screen.queryByText("Namespace")).not.toBeInTheDocument();
  });
});

describe("MetadataFields labels", () => {
  it("adds a label with Enter", () => {
    const onChange = setup();
    const input = screen.getByLabelText("Labels");
    fireEvent.change(input, { target: { value: "team=ai" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(getAtPath(onChange.mock.calls[0][0], ["metadata", "labels"])).toEqual({ team: "ai" });
  });

  it("adds a label with the Add button", () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText("Labels"), { target: { value: "env = prod " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(getAtPath(onChange.mock.calls[0][0], ["metadata", "labels"])).toEqual({ env: "prod" });
  });

  it("ignores drafts without a key=value shape", () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText("Labels"), { target: { value: "no-equals" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a label, dropping the labels object when it empties", () => {
    const onChange = setup({ doc: doc({ labels: { team: "ai" } }) });
    fireEvent.click(screen.getByRole("button", { name: "Remove label team" }));
    expect(getAtPath(onChange.mock.calls[0][0], ["metadata", "labels"])).toBeUndefined();
  });

  it("keeps remaining labels when one of several is removed", () => {
    const onChange = setup({ doc: doc({ labels: { team: "ai", env: "prod" } }) });
    fireEvent.click(screen.getByRole("button", { name: "Remove label team" }));
    expect(getAtPath(onChange.mock.calls[0][0], ["metadata", "labels"])).toEqual({ env: "prod" });
  });
});
