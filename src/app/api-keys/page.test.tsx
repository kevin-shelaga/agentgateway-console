import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApiKeysPage from "@/app/api-keys/page";
import type { LlmKeyMeta } from "@/lib/llm-keys-client";
import type { K8sResource } from "@/lib/types";
import { aiBackend, namespaceList } from "@/test/fixtures";
import { mockFetch, renderWithProviders, type FetchRoute } from "@/test/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/api-keys",
}));

const managedKey: LlmKeyMeta = {
  name: "openai-key",
  namespace: "agents",
  creationTimestamp: "2026-06-01T00:00:00Z",
  labels: {
    "agentgateway.dev/managed-by": "console",
    "agentgateway.dev/provider": "openai",
  },
  managed: true,
};

const externalKey: LlmKeyMeta = {
  name: "byo-key",
  namespace: "agents",
  creationTimestamp: "2026-06-05T00:00:00Z",
  managed: false,
};

/** aiBackend has no policies — this one consumes managedKey via secretRef. */
const securedBackend: K8sResource = {
  apiVersion: "agentgateway.dev/v1alpha1",
  kind: "AgentgatewayBackend",
  metadata: { name: "secured-backend", namespace: "agents", resourceVersion: "9" },
  spec: {
    ai: { provider: { openai: { model: "gpt-4o-mini" } } },
    policies: { auth: { secretRef: { name: "openai-key" } } },
  },
};

function setup(overrides: FetchRoute[] = []) {
  return mockFetch([
    { match: "/api/llm-keys", body: { items: [managedKey, externalKey] } },
    { match: "/agentgatewaybackends", body: { items: [securedBackend, aiBackend] } },
    { match: "/namespaces", body: { items: namespaceList } },
    ...overrides,
  ]);
}

function callsWithMethod(spy: ReturnType<typeof mockFetch>, method: string) {
  return spy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method);
}

async function openRowActions(user: ReturnType<typeof userEvent.setup>, keyName: string) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${keyName}` }));
}

describe("ApiKeysPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders keys with provider, managed/external badges, and backend references", async () => {
    setup();
    renderWithProviders(<ApiKeysPage />);

    expect(await screen.findByRole("heading", { name: /API Keys/ })).toBeInTheDocument();
    expect(await screen.findByText("openai-key")).toBeInTheDocument();
    expect(screen.getByText("byo-key")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("managed")).toBeInTheDocument();
    expect(screen.getByText("external")).toBeInTheDocument();

    // Referenced-by joins on secretRef.name + namespace and links to the backend.
    expect(screen.getByRole("link", { name: "secured-backend" })).toHaveAttribute(
      "href",
      "/resources/backends/agents/secured-backend",
    );
    // openai-backend (no policies) must not appear as a reference.
    expect(screen.queryByRole("link", { name: "openai-backend" })).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no keys", async () => {
    setup([{ match: "/api/llm-keys", body: { items: [] } }]);
    renderWithProviders(<ApiKeysPage />);

    expect(await screen.findByText("No API keys yet")).toBeInTheDocument();
  });

  it("shows the unreachable state on server errors", async () => {
    setup([
      {
        match: "/api/llm-keys",
        status: 500,
        body: { error: { status: 500, reason: "InternalError", message: "boom", causes: [] } },
      },
    ]);
    renderWithProviders(<ApiKeysPage />);

    expect(await screen.findByText("Cluster unreachable")).toBeInTheDocument();
  });

  it("creates a key through the dialog without ever displaying the value", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup();
    renderWithProviders(<ApiKeysPage />);
    await screen.findByText("openai-key");

    await user.click(screen.getByRole("button", { name: /Create API key/ }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText("Name"), "anthropic-key");

    await user.click(within(dialog).getByRole("combobox", { name: "Namespace" }));
    await user.click(await screen.findByRole("option", { name: "agents" }));

    await user.click(within(dialog).getByRole("combobox", { name: /Provider hint/ }));
    await user.click(await screen.findByRole("option", { name: "anthropic" }));

    const keyInput = within(dialog).getByLabelText("API key");
    expect(keyInput).toHaveAttribute("type", "password");
    await user.type(keyInput, "sk-ant-supersecret");
    // Masked input: the value must never be rendered as text anywhere.
    expect(screen.queryByText(/sk-ant-supersecret/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(callsWithMethod(spy, "POST")).toHaveLength(1));
    const [url, init] = callsWithMethod(spy, "POST")[0];
    expect(String(url)).toBe("/api/llm-keys");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: "anthropic-key",
      namespace: "agents",
      apiKey: "sk-ant-supersecret",
      providerHint: "anthropic",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("disables create until name, namespace, and key are filled", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setup();
    renderWithProviders(<ApiKeysPage />);
    await screen.findByText("openai-key");

    await user.click(screen.getByRole("button", { name: /Create API key/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("rotates a key via the row action", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup();
    renderWithProviders(<ApiKeysPage />);
    await screen.findByText("openai-key");

    await openRowActions(user, "openai-key");
    await user.click(await screen.findByRole("menuitem", { name: /Rotate/ }));

    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("New API key");
    expect(input).toHaveAttribute("type", "password");
    await user.type(input, "sk-rotated");
    await user.click(within(dialog).getByRole("button", { name: "Rotate" }));

    await waitFor(() => expect(callsWithMethod(spy, "PUT")).toHaveLength(1));
    const [url, init] = callsWithMethod(spy, "PUT")[0];
    expect(String(url)).toBe("/api/llm-keys/agents/openai-key");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ apiKey: "sk-rotated" });
  });

  it("warns about referencing backends before deleting and then deletes", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup();
    renderWithProviders(<ApiKeysPage />);
    await screen.findByText("openai-key");

    await openRowActions(user, "openai-key");
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Still referenced by 1 backend/)).toBeInTheDocument();
    expect(within(dialog).getByText("agents/secured-backend")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(callsWithMethod(spy, "DELETE")).toHaveLength(1));
    expect(String(callsWithMethod(spy, "DELETE")[0][0])).toBe("/api/llm-keys/agents/openai-key");
  });

  it("disables delete for keys the console does not manage", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup();
    renderWithProviders(<ApiKeysPage />);
    await screen.findByText("byo-key");

    await openRowActions(user, "byo-key");
    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/ });
    // Radix blocks interaction on disabled items (pointer-events: none in real browsers).
    expect(deleteItem).toHaveAttribute("data-disabled");
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    expect(callsWithMethod(spy, "DELETE")).toHaveLength(0);
  });

  it("filters by namespace through the query string", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup();
    renderWithProviders(<ApiKeysPage />);
    await screen.findByText("openai-key");

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "agents" }));

    await waitFor(() =>
      expect(
        spy.mock.calls.some(([u]) => String(u) === "/api/llm-keys?namespace=agents"),
      ).toBe(true),
    );
  });
});
