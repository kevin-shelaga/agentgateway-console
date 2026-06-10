import type { ComponentType } from "react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";

/**
 * Kind-specific guided forms, keyed by registry id. Kinds without an entry
 * fall back to YAML-only editing (still schema-validated and dry-run gated).
 */
export const FORMS: Record<string, ComponentType<ResourceFormProps>> = {};
