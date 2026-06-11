import { describe, expect, it } from "vitest";
import { generateApiKey } from "./generate-key";

describe("generateApiKey", () => {
  it("produces prefixed, alphanumeric keys of the requested strength", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^sk_[A-Za-z0-9]{40}$/);
  });

  it("honors a custom prefix", () => {
    expect(generateApiKey("sk-test")).toMatch(/^sk-test_[A-Za-z0-9]{40}$/);
  });

  it("is non-deterministic", () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()));
    expect(keys.size).toBe(20);
  });
});
