import { describe, expect, it } from "vitest";
import { formatCpu, formatMemory, parseCpuMillis, parseMemoryBytes } from "./quantity";

describe("parseCpuMillis", () => {
  it("parses kubelet metric forms", () => {
    expect(parseCpuMillis("2m")).toBe(2);
    expect(parseCpuMillis("1500000n")).toBe(1.5);
    expect(parseCpuMillis("250u")).toBe(0.25);
    expect(parseCpuMillis("1")).toBe(1000);
    expect(parseCpuMillis("0.5")).toBe(500);
  });
  it("returns null for garbage", () => {
    expect(parseCpuMillis("abc")).toBeNull();
    expect(parseCpuMillis("")).toBeNull();
  });
});

describe("parseMemoryBytes", () => {
  it("parses binary and decimal suffixes", () => {
    expect(parseMemoryBytes("16Mi")).toBe(16 * 1024 * 1024);
    expect(parseMemoryBytes("82452Ki")).toBe(82452 * 1024);
    expect(parseMemoryBytes("1Gi")).toBe(1024 ** 3);
    expect(parseMemoryBytes("500M")).toBe(500_000_000);
    expect(parseMemoryBytes("1024")).toBe(1024);
  });
  it("returns null for garbage", () => {
    expect(parseMemoryBytes("lots")).toBeNull();
  });
});

describe("formatters", () => {
  it("formats cpu", () => {
    expect(formatCpu(2)).toBe("2m");
    expect(formatCpu(0.4)).toBe("0.4m");
    expect(formatCpu(0.503928)).toBe("0.5m");
    expect(formatCpu(0)).toBe("0m");
    expect(formatCpu(1500)).toBe("1.5");
  });
  it("formats memory", () => {
    expect(formatMemory(16 * 1024 * 1024)).toBe("16Mi");
    expect(formatMemory(82452 * 1024)).toBe("81Mi");
    expect(formatMemory(2.5 * 1024 ** 3)).toBe("2.5Gi");
    expect(formatMemory(512)).toBe("512B");
  });
});
