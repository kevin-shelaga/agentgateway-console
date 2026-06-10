import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HttpRouteForm } from "@/components/forms/httproute-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { aiBackend, gateway, namespaceList, serviceList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const desc = getResource("httproutes")!;

function setup(doc: K8sResource = desc.template("default")) {
  mockResourceLists({
    gateways: [gateway],
    services: serviceList,
    agentgatewaybackends: [aiBackend],
    namespaces: namespaceList,
  });
  const onChange = vi.fn();
  renderWithProviders(<HttpRouteForm doc={doc} onChange={onChange} />);
  return onChange;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): K8sResource {
  return onChange.mock.calls.at(-1)![0] as K8sResource;
}

describe("HttpRouteForm rendering", () => {
  it("renders parent refs, hostnames and the template rule", () => {
    setup();
    expect(screen.getByText("Parent refs")).toBeInTheDocument();
    expect(screen.getByText("Hostnames")).toBeInTheDocument();
    expect(screen.getByText("Rule 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/")).toBeInTheDocument();
  });

  it("renders empty states for a garbage spec without crashing", () => {
    setup({
      apiVersion: "gateway.networking.k8s.io/v1",
      kind: "HTTPRoute",
      metadata: { name: "x" },
      spec: { rules: "nope", parentRefs: 42, hostnames: { a: 1 } },
    } as unknown as K8sResource);
    expect(screen.getByText("No rules yet.")).toBeInTheDocument();
    expect(screen.getByText("No parent refs yet.")).toBeInTheDocument();
  });
});

describe("HttpRouteForm rules", () => {
  it("edits a match path value at spec.rules[0].matches[0].path.value", () => {
    const onChange = setup();
    fireEvent.change(screen.getByDisplayValue("/"), { target: { value: "/v1/chat" } });
    expect(
      getAtPath(lastDoc(onChange), ["spec", "rules", 0, "matches", 0, "path", "value"]),
    ).toBe("/v1/chat");
  });

  it("appends a rule with a default PathPrefix match", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add rule/ }));
    const rules = getAtPath(lastDoc(onChange), ["spec", "rules"]) as unknown[];
    expect(rules).toHaveLength(2);
    expect(rules[1]).toEqual({
      matches: [{ path: { type: "PathPrefix", value: "/" } }],
      backendRefs: [],
    });
  });

  it("removes a rule", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Remove rule 1" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "rules"])).toEqual([]);
  });

  it("notes YAML-only filters", () => {
    const doc = desc.template("default");
    const rules = (doc.spec as Record<string, unknown>).rules as Record<string, unknown>[];
    rules[0].filters = [{ type: "RequestHeaderModifier" }];
    setup(doc);
    expect(screen.getByText(/1 filter — edit filters in YAML\./)).toBeInTheDocument();
  });
});

describe("HttpRouteForm backendRefs", () => {
  it("switching kind to Service drops the agentgateway group", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup();
    // The template backendRef is an AgentgatewayBackend; its kind select shows that.
    await user.click(screen.getByText("AgentgatewayBackend"));
    await user.click(await screen.findByRole("option", { name: "Service" }));
    const ref = getAtPath(lastDoc(onChange), ["spec", "rules", 0, "backendRefs", 0]) as Record<
      string,
      unknown
    >;
    expect(ref.kind).toBe("Service");
    expect(ref.group).toBeUndefined();
  });

  it("appends and removes backend refs", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add backend/ }));
    expect(
      getAtPath(lastDoc(onChange), ["spec", "rules", 0, "backendRefs"]) as unknown[],
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove backend my-backend" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "rules", 0, "backendRefs"])).toEqual([]);
  });

  it("sets the weight at the right path", () => {
    const onChange = setup();
    fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: "5" } });
    expect(
      getAtPath(lastDoc(onChange), ["spec", "rules", 0, "backendRefs", 0, "weight"]),
    ).toBe(5);
  });
});

describe("HttpRouteForm hostnames", () => {
  it("adds a hostname chip to spec.hostnames", () => {
    const onChange = setup();
    const input = screen.getByPlaceholderText("app.example.com");
    fireEvent.change(input, { target: { value: "chat.example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(getAtPath(lastDoc(onChange), ["spec", "hostnames"])).toEqual(["chat.example.com"]);
  });

  it("deletes spec.hostnames entirely when the last chip is removed", () => {
    const doc = desc.template("default");
    (doc.spec as Record<string, unknown>).hostnames = ["only.example.com"];
    const onChange = setup(doc);
    fireEvent.click(screen.getByRole("button", { name: "Remove only.example.com" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "hostnames"])).toBeUndefined();
  });
});

describe("HttpRouteForm parent refs", () => {
  it("appends a parent ref", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add parent/ }));
    const refs = getAtPath(lastDoc(onChange), ["spec", "parentRefs"]) as unknown[];
    expect(refs).toHaveLength(2);
    expect(refs[1]).toEqual({ name: "" });
  });

  it("sets and clears the parent ref namespace via setOrDelete", () => {
    const onChange = setup();
    // Placeholder is the route's own namespace ("default" from the template).
    const nsInput = screen.getByPlaceholderText("default");
    fireEvent.change(nsInput, { target: { value: "agentgateway-system" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "parentRefs", 0, "namespace"])).toBe(
      "agentgateway-system",
    );
  });
});
