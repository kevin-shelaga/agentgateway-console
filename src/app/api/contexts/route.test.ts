import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/k8s/client", () => ({
  listContexts: vi.fn(),
}));

import { listContexts } from "@/lib/k8s/client";
import { GET } from "./route";

const mockedListContexts = vi.mocked(listContexts);

describe("GET /api/contexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the kubeconfig contexts", async () => {
    const info = { contexts: ["dev", "prod"], current: "dev", inCluster: false };
    mockedListContexts.mockReturnValue(info);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(info);
  });

  it("returns an error response when listing contexts throws", async () => {
    mockedListContexts.mockImplementation(() => {
      throw new Error("no kubeconfig found");
    });

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatchObject({
      status: 500,
      reason: "Unknown",
      message: "no kubeconfig found",
    });
  });
});
