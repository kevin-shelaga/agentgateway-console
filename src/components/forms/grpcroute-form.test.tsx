import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GrpcRouteForm } from "@/components/forms/grpcroute-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { gateway, namespaceList, serviceList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const desc = getResource("grpcroutes")!;

function setup(doc: K8sResource = desc.template("default")) {
  mockResourceLists({
    gateways: [gateway],
    services: serviceList,
    agentgatewaybackends: [],
    namespaces: namespaceList,
  });
  const onChange = vi.fn();
  renderWithProviders(<GrpcRouteForm doc={doc} onChange={onChange} />);
  return onChange;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): K8sResource {
  return onChange.mock.calls.at(-1)![0] as K8sResource;
}

/** Template rule with an existing method match. */
function withMethod(method: Record<string, unknown>): K8sResource {
  const doc = desc.template("default");
  (doc.spec as Record<string, unknown>).rules = [{ matches: [{ method }], backendRefs: [] }];
  return doc;
}

describe("GrpcRouteForm rendering", () => {
  it("renders the template rule (no matches yet)", () => {
    setup();
    expect(screen.getByText("Rule 1")).toBeInTheDocument();
    expect(screen.getByText("No matches (matches everything).")).toBeInTheDocument();
  });

  it("shows method match inputs once a match exists", () => {
    setup(withMethod({}));
    expect(screen.getByPlaceholderText("helloworld.Greeter")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("SayHello")).toBeInTheDocument();
  });

  it("survives a garbage spec", () => {
    setup({
      apiVersion: "gateway.networking.k8s.io/v1",
      kind: "GRPCRoute",
      metadata: { name: "x" },
      spec: { rules: { not: "an array" } },
    } as unknown as K8sResource);
    expect(screen.getByText("No rules yet.")).toBeInTheDocument();
  });
});

describe("GrpcRouteForm method matches", () => {
  it("sets method.service at the right path", () => {
    const onChange = setup(withMethod({}));
    fireEvent.change(screen.getByPlaceholderText("helloworld.Greeter"), {
      target: { value: "chat.ChatService" },
    });
    expect(
      getAtPath(lastDoc(onChange), ["spec", "rules", 0, "matches", 0, "method", "service"]),
    ).toBe("chat.ChatService");
  });

  it("drops the whole method object when its last field is cleared", () => {
    const onChange = setup(withMethod({ service: "chat.ChatService" }));
    fireEvent.change(screen.getByDisplayValue("chat.ChatService"), { target: { value: "" } });
    expect(
      getAtPath(lastDoc(onChange), ["spec", "rules", 0, "matches", 0, "method"]),
    ).toBeUndefined();
  });

  it("keeps the method object when other fields remain", () => {
    const onChange = setup(withMethod({ service: "chat.ChatService", method: "Send" }));
    fireEvent.change(screen.getByDisplayValue("chat.ChatService"), { target: { value: "" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "rules", 0, "matches", 0, "method"])).toEqual({
      method: "Send",
    });
  });
});

describe("GrpcRouteForm rules", () => {
  it("appends a rule with one empty match", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add rule/ }));
    const rules = getAtPath(lastDoc(onChange), ["spec", "rules"]) as unknown[];
    expect(rules).toHaveLength(2);
    expect(rules[1]).toEqual({ matches: [{}], backendRefs: [] });
  });

  it("removes a match row", () => {
    const onChange = setup(withMethod({}));
    fireEvent.click(screen.getByRole("button", { name: "Remove match 1" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "rules", 0, "matches"])).toEqual([]);
  });
});

describe("GrpcRouteForm hostnames", () => {
  it("adds a hostname to spec.hostnames", () => {
    const onChange = setup();
    const input = screen.getByPlaceholderText("grpc.example.com");
    fireEvent.change(input, { target: { value: "rpc.example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(getAtPath(lastDoc(onChange), ["spec", "hostnames"])).toEqual(["rpc.example.com"]);
  });
});
