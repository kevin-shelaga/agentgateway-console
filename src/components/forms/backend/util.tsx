"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Rec = Record<string, unknown>;

/** Safely view an unknown value as an object record (never throws). */
export function rec(v: unknown): Rec {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};
}

/** Coerce an unknown doc value into an Input-friendly string. */
export function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Coerce an unknown doc value into a numeric Input string (ports etc.). */
export function asNumberString(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v;
  return "";
}

/** Labeled field wrapper used across the backend form. */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Muted note for parts of the doc the guided form intentionally leaves to YAML. */
export function YamlOnlyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs italic text-muted-foreground">{children}</p>;
}
