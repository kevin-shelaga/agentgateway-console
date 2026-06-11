import { describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookup(...args) }));

import { assertAllowedTarget, isBlockedIp } from "./target-guard";

describe("isBlockedIp", () => {
  it("blocks IPv4 link-local (cloud metadata) addresses", () => {
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("169.254.0.1")).toBe(true);
  });

  it("blocks IPv6 link-local and v4-mapped link-local", () => {
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("FEBF::1234")).toBe(true);
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows loopback, private, and public addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "4.229.185.215", "::1", "fd00::1"]) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });
});

describe("assertAllowedTarget", () => {
  it("checks IP hosts directly without DNS", async () => {
    await expect(assertAllowedTarget(new URL("http://169.254.169.254/latest/meta-data"))).rejects.toThrow(
      /link-local/,
    );
    await expect(assertAllowedTarget(new URL("http://127.0.0.1:8080/v1"))).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("strips IPv6 brackets", async () => {
    await expect(assertAllowedTarget(new URL("http://[fe80::1]/x"))).rejects.toThrow(/link-local/);
  });

  it("resolves hostnames and blocks when any address is link-local", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.1" }, { address: "169.254.169.254" }]);
    await expect(assertAllowedTarget(new URL("http://metadata.internal/"))).rejects.toThrow(
      /metadata.internal resolves to link-local/,
    );
  });

  it("allows hostnames resolving to routable addresses", async () => {
    lookup.mockResolvedValue([{ address: "4.229.185.215" }]);
    await expect(assertAllowedTarget(new URL("https://gw.example.com/v1"))).resolves.toBeUndefined();
  });
});
