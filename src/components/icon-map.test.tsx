import { Box, DoorOpen, Server } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ICONS, resourceIcon } from "@/components/icon-map";

describe("resourceIcon", () => {
  it("resolves known registry icon names", () => {
    expect(resourceIcon("doorOpen")).toBe(DoorOpen);
    expect(resourceIcon("server")).toBe(Server);
  });

  it("falls back to Box for unknown names", () => {
    expect(resourceIcon("definitely-not-an-icon")).toBe(Box);
    expect(resourceIcon("")).toBe(Box);
  });

  it("exposes every mapped icon as a component", () => {
    for (const [name, Icon] of Object.entries(ICONS)) {
      expect(resourceIcon(name)).toBe(Icon);
    }
  });
});
