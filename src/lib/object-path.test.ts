import { describe, expect, it } from "vitest";
import { deleteAtPath, getAtPath, setAtPath } from "./object-path";

describe("getAtPath", () => {
  it("walks objects and arrays", () => {
    const obj = { spec: { rules: [{ backendRefs: [{ name: "be" }] }] } };
    expect(getAtPath(obj, ["spec", "rules", 0, "backendRefs", 0, "name"])).toBe("be");
  });
  it("returns undefined for missing paths and non-objects", () => {
    expect(getAtPath({ a: 1 }, ["b", "c"])).toBeUndefined();
    expect(getAtPath(null, ["a"])).toBeUndefined();
    expect(getAtPath("str", ["length"])).toBeUndefined();
  });
  it("returns the object itself for an empty path", () => {
    const obj = { a: 1 };
    expect(getAtPath(obj, [])).toBe(obj);
  });
});

describe("setAtPath", () => {
  it("sets deep values immutably", () => {
    const obj = { spec: { listeners: [{ port: 80 }] } };
    const next = setAtPath(obj, ["spec", "listeners", 0, "port"], 443);
    expect(next.spec.listeners[0].port).toBe(443);
    expect(obj.spec.listeners[0].port).toBe(80);
    expect(next).not.toBe(obj);
  });
  it("creates intermediate objects and arrays", () => {
    const next = setAtPath({} as Record<string, unknown>, ["a", 0, "b"], "x");
    expect(next).toEqual({ a: [{ b: "x" }] });
    expect(Array.isArray((next as { a: unknown }).a)).toBe(true);
  });
  it("replaces the root for an empty path", () => {
    expect(setAtPath({ a: 1 }, [], { b: 2 })).toEqual({ b: 2 });
  });
});

describe("deleteAtPath", () => {
  it("deletes object keys immutably", () => {
    const obj = { spec: { a: 1, b: 2 } };
    const next = deleteAtPath(obj, ["spec", "a"]);
    expect(next.spec).toEqual({ b: 2 });
    expect(obj.spec.a).toBe(1);
  });
  it("splices array indices", () => {
    const obj = { items: ["a", "b", "c"] };
    expect(deleteAtPath(obj, ["items", 1]).items).toEqual(["a", "c"]);
  });
  it("is a no-op for missing parents and empty paths", () => {
    const obj = { a: 1 };
    expect(deleteAtPath(obj, ["x", "y"])).toEqual({ a: 1 });
    expect(deleteAtPath(obj, [])).toBe(obj);
  });
});
