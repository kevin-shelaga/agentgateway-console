import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KubeContext } from "@/lib/hooks";
import type { K8sResource } from "@/lib/types";

/** Render with the app's providers (fresh QueryClient, no retries/caching). */
export function renderWithProviders(ui: React.ReactNode): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <KubeContext.Provider value={{ context: null, setContext: () => {} }}>
        <TooltipProvider>{ui}</TooltipProvider>
      </KubeContext.Provider>
    </QueryClientProvider>,
  );
}

/**
 * A params promise React's `use()` can unwrap synchronously in tests:
 * pre-set the internal fulfilled status so the component never suspends.
 */
export function resolvedParams<T>(value: T): Promise<T> {
  const promise = Promise.resolve(value) as Promise<T> & { status: string; value: T };
  promise.status = "fulfilled";
  promise.value = value;
  return promise;
}

export interface FetchRoute {
  /** Substring or RegExp matched against the request URL. */
  match: string | RegExp;
  /** Response body (object → JSON; string + raw → text/plain as-is). */
  body: unknown;
  status?: number;
  /** Serve the body verbatim (for streamed text endpoints). */
  raw?: boolean;
}

/**
 * Install a fetch mock answering BFF routes. Later entries win, unmatched
 * URLs 404. Returns the spy for call assertions.
 */
export function mockFetch(routes: FetchRoute[]) {
  const spy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    for (let i = routes.length - 1; i >= 0; i--) {
      const route = routes[i];
      const hit =
        typeof route.match === "string" ? url.includes(route.match) : route.match.test(url);
      if (hit) {
        if (route.raw) {
          return new Response(String(route.body), {
            status: route.status ?? 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        return new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: { status: 404, reason: "NotFound", message: `no mock for ${url}`, causes: [] } }), { status: 404 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Shorthand: mock the standard list endpoints the dashboard/pages hit. */
export function mockResourceLists(lists: Partial<Record<string, K8sResource[]>>) {
  const routes: FetchRoute[] = Object.entries(lists).map(([plural, items]) => ({
    match: `/${plural}`,
    body: { items: items ?? [] },
  }));
  routes.push({ match: "/api/cluster", body: { connected: true, context: "test-ctx" } });
  routes.push({
    match: "/api/contexts",
    body: { contexts: ["test-ctx"], current: "test-ctx", inCluster: false },
  });
  return mockFetch(routes);
}
