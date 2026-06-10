import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PlaygroundPage from "@/app/playground/page";
import { aiBackend, gateway, httpRoute, staticBackend } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/playground",
}));

const completion = {
  choices: [{ message: { role: "assistant", content: "Hello there from the gateway!" } }],
  usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
};

function setup(llmResponse: unknown = { ok: true, status: 200, statusText: "OK", durationMs: 850, body: completion }) {
  return mockFetch([
    { match: "/agentgatewaybackends", body: { items: [aiBackend, staticBackend] } },
    { match: "/httproutes", body: { items: [httpRoute] } },
    { match: "/gateways", body: { items: [gateway] } },
    { match: "/api/llm-test", body: llmResponse },
  ]);
}

async function pickBackend(user: ReturnType<typeof userEvent.setup>) {
  await user.click((await screen.findAllByRole("combobox"))[0]);
  await user.click(await screen.findByRole("option", { name: "agents/openai-backend" }));
}

describe("PlaygroundPage", () => {
  it("lists only AI backends and seeds url/model from the resolved endpoint", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setup();
    renderWithProviders(<PlaygroundPage />);

    await user.click((await screen.findAllByRole("combobox"))[0]);
    expect(screen.getByRole("option", { name: "agents/openai-backend" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /static-backend/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "agents/openai-backend" }));

    // Endpoint resolved through route → gateway → address; model from the spec.
    await waitFor(() =>
      expect(screen.getByDisplayValue("http://4.229.185.215/v1/chat/completions")).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("chat.example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gpt-4o-mini")).toBeInTheDocument();
  });

  it("sends the chat completion and renders the assistant reply with latency and usage", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const spy = setup();
    renderWithProviders(<PlaygroundPage />);
    await pickBackend(user);
    await waitFor(() => expect(screen.getByDisplayValue(/chat\/completions/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Send/ }));

    expect(await screen.findByText("Hello there from the gateway!")).toBeInTheDocument();
    expect(screen.getByText("200 OK")).toBeInTheDocument();
    expect(screen.getByText("850ms")).toBeInTheDocument();
    expect(screen.getByText(/19 total/)).toBeInTheDocument();

    const llmCall = spy.mock.calls.find(([u]) => String(u).includes("/api/llm-test"))!;
    const payload = JSON.parse((llmCall[1] as RequestInit).body as string);
    expect(payload.url).toBe("http://4.229.185.215/v1/chat/completions");
    expect(payload.hostname).toBe("chat.example.com");
    expect(payload.body.model).toBe("gpt-4o-mini");
    expect(payload.body.messages.at(-1).role).toBe("user");
    expect(payload.insecureTls).toBe(false);
  });

  it("shows raw output and error state for failed calls", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    setup({ ok: false, status: 0, statusText: "", durationMs: 120, body: "connect ECONNREFUSED" });
    renderWithProviders(<PlaygroundPage />);
    await pickBackend(user);
    await waitFor(() => expect(screen.getByDisplayValue(/chat\/completions/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    expect(await screen.findByText("network error")).toBeInTheDocument();
    expect(screen.getByText(/ECONNREFUSED/)).toBeInTheDocument();
  });
});
