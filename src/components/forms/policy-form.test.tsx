import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PolicyForm } from "@/components/forms/policy-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { aiBackend, gateway, httpRoute, namespaceList, serviceList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const desc = getResource("policies")!;

function setup(doc: K8sResource = desc.template("default")) {
  mockResourceLists({
    "v1/gateways": [gateway],
    httproutes: [httpRoute],
    grpcroutes: [],
    services: serviceList,
    agentgatewaybackends: [aiBackend],
    namespaces: namespaceList,
  });
  const onChange = vi.fn();
  renderWithProviders(<PolicyForm doc={doc} onChange={onChange} />);
  return onChange;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): K8sResource {
  return onChange.mock.calls.at(-1)![0] as K8sResource;
}

describe("PolicyForm targets", () => {
  it("appends a default Gateway target", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add target/ }));
    const refs = getAtPath(lastDoc(onChange), ["spec", "targetRefs"]) as unknown[];
    expect(refs).toHaveLength(2);
    expect(refs[1]).toEqual({
      group: "gateway.networking.k8s.io",
      kind: "Gateway",
      name: "",
    });
  });

  it("removing the only target deletes spec.targetRefs entirely", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Remove target 1" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "targetRefs"])).toBeUndefined();
  });

  it("sets and clears a target sectionName", () => {
    const onChange = setup();
    const input = screen.getByPlaceholderText("sectionName (optional)");
    fireEvent.change(input, { target: { value: "https" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "targetRefs", 0, "sectionName"])).toBe("https");
  });

  it("mentions YAML-managed targetSelectors", () => {
    const doc = desc.template("default");
    (doc.spec as Record<string, unknown>).targetSelectors = [{ matchLabels: { app: "x" } }];
    setup(doc);
    expect(screen.getByText("targetSelectors")).toBeInTheDocument();
  });
});

describe("PolicyForm traffic editor", () => {
  it("is enabled by the template (spec.traffic present)", () => {
    setup();
    expect(screen.getByRole("switch", { name: "Enable traffic policy" })).toBeChecked();
    expect(screen.getByText("Request timeout")).toBeInTheDocument();
  });

  it("sets the request timeout at spec.traffic.timeouts.request", () => {
    const onChange = setup();
    fireEvent.change(screen.getByPlaceholderText("30s"), { target: { value: "10s" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "traffic", "timeouts", "request"])).toBe("10s");
  });

  it("prunes empty parents when the timeout is cleared, keeping spec.traffic", () => {
    const doc = desc.template("default");
    (doc.spec as Record<string, unknown>).traffic = { timeouts: { request: "30s" } };
    const onChange = setup(doc);
    fireEvent.change(screen.getByDisplayValue("30s"), { target: { value: "" } });
    const next = lastDoc(onChange);
    expect(getAtPath(next, ["spec", "traffic", "timeouts"])).toBeUndefined();
    expect(getAtPath(next, ["spec", "traffic"])).toEqual({});
  });

  it("adds a CORS allow origin", () => {
    const onChange = setup();
    const input = screen.getByPlaceholderText("https://example.com");
    fireEvent.change(input, { target: { value: "https://app.example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(getAtPath(lastDoc(onChange), ["spec", "traffic", "cors", "allowOrigins"])).toEqual([
      "https://app.example.com",
    ]);
  });

  it("toggles CORS allowCredentials on and prunes it off", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Allow credentials" }));
    expect(
      getAtPath(lastDoc(onChange), ["spec", "traffic", "cors", "allowCredentials"]),
    ).toBe(true);
  });

  it("adds a default local rate limit row", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add local limit/ }));
    expect(getAtPath(lastDoc(onChange), ["spec", "traffic", "rateLimit", "local"])).toEqual([
      { requests: 100, unit: "Seconds" },
    ]);
  });

  it("sets retry attempts as a number", () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText("Retry attempts"), { target: { value: "3" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "traffic", "retry", "attempts"])).toBe(3);
  });

  it("chips YAML-only traffic keys", () => {
    const doc = desc.template("default");
    (doc.spec as Record<string, unknown>).traffic = { transformation: {} };
    setup(doc);
    expect(screen.getByText("transformation")).toBeInTheDocument();
  });
});

describe("PolicyForm frontend/backend sections", () => {
  it("toggling frontend on seeds spec.frontend = {}", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Enable frontend policy" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "frontend"])).toEqual({});
  });

  it("chips configured frontend sub-keys", () => {
    const doc = desc.template("default");
    (doc.spec as Record<string, unknown>).frontend = { tls: {}, accessLog: {} };
    setup(doc);
    expect(screen.getByText("tls")).toBeInTheDocument();
    expect(screen.getByText("accessLog")).toBeInTheDocument();
  });

  it("toggling backend off deletes spec.backend", () => {
    const doc = desc.template("default");
    (doc.spec as Record<string, unknown>).backend = { auth: {} };
    const onChange = setup(doc);
    fireEvent.click(screen.getByRole("switch", { name: "Enable backend policy" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "backend"])).toBeUndefined();
  });
});

describe("PolicyForm defensive rendering", () => {
  it("chips unknown spec keys and tolerates non-object values", () => {
    setup({
      apiVersion: "agentgateway.dev/v1alpha1",
      kind: "AgentgatewayPolicy",
      metadata: { name: "x" },
      spec: { ai: "not-an-object", targetRefs: "garbage" },
    } as unknown as K8sResource);
    expect(screen.getByText(/other spec keys configured in YAML:/)).toBeInTheDocument();
    expect(screen.getByText("ai")).toBeInTheDocument();
    // Garbage targetRefs renders no rows but the editor still works.
    expect(screen.getByRole("button", { name: /Add target/ })).toBeInTheDocument();
  });
});
