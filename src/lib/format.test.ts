import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAge } from "./format";

describe("formatAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats kubectl-style ages", () => {
    expect(formatAge("2026-06-10T11:59:30Z")).toBe("30s");
    expect(formatAge("2026-06-10T11:15:00Z")).toBe("45m");
    expect(formatAge("2026-06-10T03:00:00Z")).toBe("9h");
    expect(formatAge("2026-06-01T12:00:00Z")).toBe("9d");
    expect(formatAge("2024-06-10T12:00:00Z")).toBe("2y");
  });

  it("clamps future timestamps to 0s", () => {
    expect(formatAge("2026-06-10T12:05:00Z")).toBe("0s");
  });

  it("handles missing and invalid input", () => {
    expect(formatAge(undefined)).toBe("—");
    expect(formatAge("not-a-date")).toBe("—");
  });
});
