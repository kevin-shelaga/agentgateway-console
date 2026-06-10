import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BackendForm } from "@/components/forms/backend-form";
import { getAtPath } from "@/lib/object-path";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";
import { mcpBackend, namespaceList, secretList, serviceList, staticBackend } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

const desc = getResource("backends")!;

function setup(doc: K8sResource = desc.template("default")) {
  mockResourceLists({
    services: serviceList,
    secrets: secretList,
    namespaces: namespaceList,
  });
  const onChange = vi.fn();
  renderWithProviders(<BackendForm doc={doc} onChange={onChange} />);
  return onChange;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): K8sResource {
  return onChange.mock.calls.at(-1)![0] as K8sResource;
}

describe("BackendForm type switching", () => {
  it("renders the AI section for the registry template", () => {
    setup();
    expect(screen.getByText("AI provider")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gpt-4o-mini")).toBeInTheDocument();
  });

  it("replaces the spec with the new type's defaults on switch", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Static" }));
    const next = lastDoc(onChange);
    expect(getAtPath(next, ["spec", "static"])).toEqual({ host: "", port: 80 });
    expect(getAtPath(next, ["spec", "ai"])).toBeUndefined();
  });

  it("preserves spec.policies across a type switch", () => {
    const doc = desc.template("default");
    doc.spec = { ...(doc.spec as object), policies: { auth: { key: "sk-test" } } };
    const onChange = setup(doc);
    fireEvent.click(screen.getByRole("button", { name: "MCP" }));
    const next = lastDoc(onChange);
    expect(getAtPath(next, ["spec", "policies", "auth", "key"])).toBe("sk-test");
    expect(getAtPath(next, ["spec", "mcp"])).toEqual({ targets: [] });
  });

  it("flags unrecognized spec keys as YAML-only", () => {
    const doc = desc.template("default");
    doc.spec = { ...(doc.spec as object), bogus: 1 };
    setup(doc);
    expect(screen.getByText(/Unrecognized spec fields/)).toBeInTheDocument();
    expect(screen.getByText("bogus")).toBeInTheDocument();
  });

  it("survives a garbage doc where spec.ai is not an object", () => {
    setup({
      apiVersion: "agentgateway.dev/v1alpha1",
      kind: "AgentgatewayBackend",
      metadata: { name: "x" },
      spec: { ai: "not-an-object" },
    } as unknown as K8sResource);
    expect(screen.getByText("AI provider")).toBeInTheDocument();
    expect(screen.getByText("Select provider")).toBeInTheDocument();
  });
});

describe("BackendForm AI section", () => {
  it("edits the provider model at spec.ai.provider.openai.model", () => {
    const onChange = setup();
    fireEvent.change(screen.getByDisplayValue("gpt-4o-mini"), {
      target: { value: "gpt-5" },
    });
    expect(getAtPath(lastDoc(onChange), ["spec", "ai", "provider", "openai", "model"])).toBe(
      "gpt-5",
    );
  });

  it("switching providers replaces the provider subtree", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup();
    // Provider select trigger shows the current provider label.
    await user.click(screen.getByText("OpenAI"));
    await user.click(await screen.findByRole("option", { name: "Anthropic" }));
    const next = lastDoc(onChange);
    expect(getAtPath(next, ["spec", "ai", "provider", "anthropic"])).toEqual({});
    expect(getAtPath(next, ["spec", "ai", "provider", "openai"])).toBeUndefined();
  });
});

describe("BackendForm static section", () => {
  it("edits host and clears port via setOrDelete", () => {
    const onChange = setup(staticBackend);
    fireEvent.change(screen.getByDisplayValue("example.com"), {
      target: { value: "internal.example.com" },
    });
    expect(getAtPath(lastDoc(onChange), ["spec", "static", "host"])).toBe("internal.example.com");

    fireEvent.change(screen.getByDisplayValue("443"), { target: { value: "" } });
    expect(getAtPath(lastDoc(onChange), ["spec", "static", "port"])).toBeUndefined();
  });
});

describe("BackendForm MCP section", () => {
  it("renders targets and appends a new one", () => {
    const onChange = setup(mcpBackend);
    expect(screen.getByDisplayValue("fetcher")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add target/ }));
    const targets = getAtPath(lastDoc(onChange), ["spec", "mcp", "targets"]) as unknown[];
    expect(targets).toHaveLength(2);
    expect(targets[1]).toEqual({ name: "target-2", static: { host: "", port: 80 } });
  });

  it("removes a target", () => {
    const onChange = setup(mcpBackend);
    fireEvent.click(screen.getByRole("button", { name: "Remove target fetcher" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "mcp", "targets"])).toEqual([]);
  });
});

describe("BackendForm auth policies", () => {
  it("switching auth mode to Secret reference seeds spec.policies.auth.secretRef", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = setup();
    // Auth mode select trigger shows the current mode label.
    await user.click(screen.getByText("None"));
    await user.click(await screen.findByRole("option", { name: "Secret reference" }));
    expect(getAtPath(lastDoc(onChange), ["spec", "policies", "auth", "secretRef"])).toEqual({
      name: "",
    });
  });
});
