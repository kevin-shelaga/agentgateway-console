import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { McpPanel } from "@/components/playground/mcp-panel";
import type { K8sResource } from "@/lib/types";
import { aiBackend, gateway, httpRoute, mcpBackend } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

/** The shared httpRoute fixture targets openai-backend; point one at the MCP backend. */
const mcpRoute: K8sResource = {
  ...httpRoute,
  metadata: { ...httpRoute.metadata, name: "mcp-route" },
  spec: {
    ...httpRoute.spec,
    hostnames: ["mcp.example.com"],
    rules: [
      {
        matches: [{ path: { type: "PathPrefix", value: "/" } }],
        backendRefs: [
          { name: "mcp-backend", group: "agentgateway.dev", kind: "AgentgatewayBackend" },
        ],
      },
    ],
  },
};

const tools = [
  {
    name: "fetch_url",
    description: "Fetch a URL through the gateway",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL" },
        maxBytes: { type: "number" },
        raw: { type: "boolean" },
        headers: { type: "object" },
      },
      required: ["url"],
    },
  },
  { name: "echo", description: "Echo the input back", inputSchema: { type: "object", properties: {} } },
];

const callContent = [
  { type: "text", text: "fetched 5 bytes" },
  { type: "image", data: "abc123", mimeType: "image/png" },
];

/** One body serves both actions: connect reads .tools, call reads .result. */
function setup(
  mcpResponse: unknown = {
    ok: true,
    durationMs: 42,
    tools,
    result: { content: callContent, isError: false },
  },
) {
  return mockFetch([
    { match: "/agentgatewaybackends", body: { items: [mcpBackend, aiBackend] } },
    { match: "/httproutes", body: { items: [httpRoute, mcpRoute] } },
    { match: "/gateways", body: { items: [gateway] } },
    { match: "/api/mcp-test", body: mcpResponse },
  ]);
}

async function pickBackend(user: ReturnType<typeof userEvent.setup>) {
  await user.click((await screen.findAllByRole("combobox"))[0]);
  await user.click(await screen.findByRole("option", { name: "agents/mcp-backend" }));
  await waitFor(() =>
    expect(screen.getByDisplayValue("http://4.229.185.215/mcp")).toBeInTheDocument(),
  );
}

function mcpPayloads(spy: ReturnType<typeof mockFetch>) {
  return spy.mock.calls
    .filter(([u]) => String(u).includes("/api/mcp-test"))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

describe("McpPanel", () => {
  it("lists only MCP backends and seeds the /mcp url from the resolved endpoint", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setup();
    renderWithProviders(<McpPanel />);

    await user.click((await screen.findAllByRole("combobox"))[0]);
    expect(screen.getByRole("option", { name: "agents/mcp-backend" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /openai-backend/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "agents/mcp-backend" }));

    // Endpoint resolved through route → gateway → address, suffixed with /mcp.
    await waitFor(() =>
      expect(screen.getByDisplayValue("http://4.229.185.215/mcp")).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("mcp.example.com")).toBeInTheDocument();
  });

  it("connects, lists tools, and calls a tool with typed form arguments", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup();
    renderWithProviders(<McpPanel />);
    await pickBackend(user);

    fireEvent.click(screen.getByRole("button", { name: /Connect & list tools/ }));
    expect(await screen.findByText("fetch_url")).toBeInTheDocument();
    expect(screen.getByText("Fetch a URL through the gateway")).toBeInTheDocument();
    expect(screen.getByText("echo")).toBeInTheDocument();
    expect(screen.getByText("2 tool(s)")).toBeInTheDocument();
    expect(screen.getByText("42ms")).toBeInTheDocument();

    const listPayload = mcpPayloads(spy)[0];
    expect(listPayload.action).toBe("listTools");
    expect(listPayload.url).toBe("http://4.229.185.215/mcp");
    expect(listPayload.hostname).toBe("mcp.example.com");
    expect(listPayload.insecureTls).toBe(false);

    // Clicking the tool opens a form with one input per schema property.
    fireEvent.click(screen.getByText("fetch_url"));
    fireEvent.change(screen.getByRole("textbox", { name: "url" }), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(screen.getByLabelText("maxBytes"), { target: { value: "1024" } });
    fireEvent.click(screen.getByRole("switch", { name: "raw" }));
    fireEvent.change(screen.getByRole("textbox", { name: "headers" }), {
      target: { value: '{"x-test":"1"}' },
    });

    fireEvent.click(screen.getByRole("button", { name: /Call tool/ }));
    expect(await screen.findByText("fetched 5 bytes")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getByText(/"type": "image"/)).toBeInTheDocument();

    const callPayload = mcpPayloads(spy).at(-1);
    expect(callPayload.action).toBe("callTool");
    expect(callPayload.toolName).toBe("fetch_url");
    expect(callPayload.args).toEqual({
      url: "https://example.com",
      maxBytes: 1024,
      raw: true,
      headers: { "x-test": "1" },
    });
  });

  it("expands the input schema and supports raw-JSON arguments with isError styling", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup({
      ok: true,
      durationMs: 42,
      tools,
      result: { content: [{ type: "text", text: "boom" }], isError: true },
    });
    renderWithProviders(<McpPanel />);
    await pickBackend(user);

    fireEvent.click(screen.getByRole("button", { name: /Connect & list tools/ }));
    expect(await screen.findByText("fetch_url")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Show schema/ })[0]);
    expect(screen.getByText(/"Target URL"/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("fetch_url"));
    fireEvent.click(screen.getByRole("button", { name: /Edit raw JSON/ }));

    // Invalid JSON surfaces a local error without hitting the BFF.
    fireEvent.change(screen.getByRole("textbox", { name: "Raw JSON arguments" }), {
      target: { value: "not json" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Call tool/ }));
    expect(await screen.findByText(/invalid JSON arguments/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Raw JSON arguments" }), {
      target: { value: '{"url":"https://raw.example"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: /Call tool/ }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByText("tool error")).toBeInTheDocument();

    const callPayload = mcpPayloads(spy).at(-1);
    expect(callPayload.args).toEqual({ url: "https://raw.example" });
  });

  it("shows BFF rejections (HTTP errors) as a connection error", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup();
    renderWithProviders(<McpPanel />);
    await pickBackend(user);

    // The next fetch after seeding is the connect call; reject it like the BFF would.
    spy.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            error: { status: 403, reason: "Forbidden", message: "only http(s) urls are supported", causes: [] },
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect & list tools/ }));
    expect(await screen.findByText(/only http\(s\) urls are supported/)).toBeInTheDocument();
  });

  it("surfaces connection failures from the BFF", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setup({ ok: false, durationMs: 120, error: "Error POSTing to endpoint (HTTP 405)" });
    renderWithProviders(<McpPanel />);
    await pickBackend(user);

    fireEvent.click(screen.getByRole("button", { name: /Connect & list tools/ }));
    expect(await screen.findByText("connection failed")).toBeInTheDocument();
    expect(screen.getByText(/HTTP 405/)).toBeInTheDocument();
    expect(screen.getByText("120ms")).toBeInTheDocument();
  });
});
