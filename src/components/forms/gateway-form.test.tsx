import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatewayForm } from "@/components/forms/gateway-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { gatewayClass, namespaceList, secretList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const desc = getResource("gateways")!;

const otherClass: K8sResource = {
  apiVersion: "gateway.networking.k8s.io/v1",
  kind: "GatewayClass",
  metadata: { name: "other-class" },
  spec: { controllerName: "example.com/other" },
};

function setup(doc: K8sResource = desc.template("default")) {
  mockResourceLists({
    gatewayclasses: [gatewayClass, otherClass],
    secrets: secretList,
    namespaces: namespaceList,
  });
  const onChange = vi.fn();
  renderWithProviders(<GatewayForm doc={doc} onChange={onChange} />);
  return onChange;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): K8sResource {
  return onChange.mock.calls.at(-1)![0] as K8sResource;
}

function httpsDoc(): K8sResource {
  return {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "Gateway",
    metadata: { name: "tls-gw", namespace: "default" },
    spec: {
      gatewayClassName: "agentgateway",
      listeners: [
        {
          name: "https",
          protocol: "HTTPS",
          port: 443,
          tls: { mode: "Terminate", certificateRefs: [{ name: "api-cert" }] },
        },
      ],
    },
  };
}

describe("GatewayForm listeners", () => {
  it("renders the template listener", () => {
    setup();
    expect(screen.getByDisplayValue("http")).toBeInTheDocument();
    expect(screen.getByDisplayValue("80")).toBeInTheDocument();
  });

  it("edits a listener name at spec.listeners[0].name", () => {
    const onChange = setup();
    fireEvent.change(screen.getByDisplayValue("http"), { target: { value: "web" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "listeners", 0, "name"])).toBe("web");
  });

  it("appends a listener with defaults", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /Add listener/ }));
    const listeners = getAtPath(lastDoc(onChange), ["spec", "listeners"]) as unknown[];
    expect(listeners).toHaveLength(2);
    expect(listeners[1]).toEqual({ name: "", port: 80, protocol: "HTTP" });
  });

  it("removes a listener row", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Remove listener http" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "listeners"])).toEqual([]);
  });

  it("shows TLS fields for HTTPS listeners", () => {
    setup(httpsDoc());
    expect(screen.getByText("TLS mode")).toBeInTheDocument();
    expect(screen.getByText("Certificate secret")).toBeInTheDocument();
  });

  it("drops listener tls when the protocol leaves HTTPS/TLS", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup(httpsDoc());
    // Protocol select trigger shows the current protocol.
    await user.click(screen.getByText("HTTPS"));
    await user.click(await screen.findByRole("option", { name: "HTTP" }));
    const next = lastDoc(onChange);
    expect(getAtPath(next, ["spec", "listeners", 0, "protocol"])).toBe("HTTP");
    expect(getAtPath(next, ["spec", "listeners", 0, "tls"])).toBeUndefined();
  });

  it("renders the empty state when spec.listeners is garbage", () => {
    setup({
      apiVersion: "gateway.networking.k8s.io/v1",
      kind: "Gateway",
      metadata: { name: "x" },
      spec: { listeners: "not-an-array" },
    } as unknown as K8sResource);
    expect(screen.getByText("No listeners defined yet.")).toBeInTheDocument();
  });
});

describe("GatewayForm gateway class", () => {
  it("changes spec.gatewayClassName via the picker", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup();
    // The class picker trigger shows the template's class name.
    await user.click(screen.getByText("agentgateway"));
    await user.click(await screen.findByRole("option", { name: "other-class" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "gatewayClassName"])).toBe("other-class");
  });
});

describe("GatewayForm addresses note", () => {
  it("mentions YAML-configured spec.addresses", () => {
    const doc = desc.template("default");
    (doc.spec as Record<string, unknown>).addresses = [{ type: "IPAddress", value: "1.2.3.4" }];
    setup(doc);
    expect(screen.getByText(/spec\.addresses: 1 address configured in/)).toBeInTheDocument();
  });
});
