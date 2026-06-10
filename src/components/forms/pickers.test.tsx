import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GatewayPicker, ResourcePicker, SecretPicker } from "@/components/forms/pickers";
import { gateway, secretList } from "@/test/fixtures";
import { mockResourceLists, renderWithProviders } from "@/test/utils";

describe("ResourcePicker", () => {
  it("lists resource names fetched from the cluster and reports the selection", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockResourceLists({ gateways: [gateway] });
    const onChange = vi.fn();
    renderWithProviders(
      <ResourcePicker resourceId="gateways" value={undefined} onChange={onChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: "api-agentgateway" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("api-agentgateway");
  });

  it("keeps a free-text value that is not in the cluster list", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockResourceLists({ gateways: [gateway] });
    renderWithProviders(
      <ResourcePicker
        resourceId="gateways"
        value="ghost-gateway"
        onChange={() => {}}
        allowFreeText
      />,
    );

    // Current value shows on the closed trigger even though the cluster doesn't have it.
    expect(screen.getByRole("combobox")).toHaveTextContent("ghost-gateway");

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "ghost-gateway" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "api-agentgateway" })).toBeInTheDocument();
  });

  it("shows an empty-list message when the cluster has none", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockResourceLists({ gateways: [] });
    renderWithProviders(
      <ResourcePicker resourceId="gateways" value={undefined} onChange={() => {}} />,
    );

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByText("No gateways found")).toBeInTheDocument();
  });
});

describe("picker wrappers", () => {
  it("SecretPicker lists secrets with free text allowed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockResourceLists({ secrets: secretList });
    renderWithProviders(
      <SecretPicker namespace="agents" value="not-in-cluster" onChange={() => {}} />,
    );

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "openai-key" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "not-in-cluster" })).toBeInTheDocument();
  });

  it("GatewayPicker lists gateways", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockResourceLists({ gateways: [gateway] });
    renderWithProviders(<GatewayPicker value={undefined} onChange={() => {}} />);

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "api-agentgateway" })).toBeInTheDocument();
  });
});
