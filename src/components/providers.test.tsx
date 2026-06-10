import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/providers";
import { ApiError } from "@/lib/api-client";
import { useSaveResource } from "@/lib/hooks";
import { getResource } from "@/lib/registry";
import { gateway } from "@/test/fixtures";
import { mockFetch } from "@/test/utils";

// Node 22+ exposes a non-functional window.localStorage (requires --localstorage-file);
// api-client reads the stored kube context from it on every request, so give it a real one.
const __store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => __store.get(k) ?? null,
  setItem: (k: string, v: string) => void __store.set(k, v),
  removeItem: (k: string) => void __store.delete(k),
  clear: () => __store.clear(),
});


describe("Providers", () => {
  it("renders children inside the app provider stack", () => {
    mockFetch([]);
    render(
      <Providers>
        <div data-testid="child">hello</div>
      </Providers>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("hello");
  });
});

describe("useSaveResource", () => {
  const desc = getResource("gateways")!;

  function wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it("dry-runs first, then creates", async () => {
    const fetchSpy = mockFetch([
      { match: "/api/dry-run", body: { ok: true } },
      { match: "/gateways", body: gateway },
    ]);
    const { result } = renderHook(() => useSaveResource(desc), { wrapper });

    await result.current.mutateAsync({ manifest: gateway, mode: "create" });

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("/api/dry-run");
    expect(urls[1]).toContain("/api/resources/gateway.networking.k8s.io/v1/gateways");
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("POST");
    const createInit = fetchSpy.mock.calls[1][1] as RequestInit;
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(String(createInit.body)).metadata.name).toBe("api-agentgateway");
  });

  it("updates via PUT to the item path in update mode", async () => {
    const fetchSpy = mockFetch([
      { match: "/api/dry-run", body: { ok: true } },
      { match: "/gateways", body: gateway },
    ]);
    const { result } = renderHook(() => useSaveResource(desc), { wrapper });

    await result.current.mutateAsync({ manifest: gateway, mode: "update" });

    const updateCall = fetchSpy.mock.calls[1];
    expect(String(updateCall[0])).toContain("/gateways/agentgateway-system/api-agentgateway");
    expect((updateCall[1] as RequestInit).method).toBe("PUT");
  });

  it("does not create when the dry-run fails", async () => {
    const fetchSpy = mockFetch([
      {
        match: "/api/dry-run",
        body: {
          error: { status: 422, reason: "Invalid", message: "spec.listeners required", causes: [] },
        },
        status: 422,
      },
      { match: "/gateways", body: gateway },
    ]);
    const { result } = renderHook(() => useSaveResource(desc), { wrapper });

    await expect(
      result.current.mutateAsync({ manifest: gateway, mode: "create" }),
    ).rejects.toMatchObject({ parsed: { message: "spec.listeners required" } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/dry-run");
  });
});
