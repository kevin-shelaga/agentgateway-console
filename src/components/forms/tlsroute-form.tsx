"use client";

import { Plus } from "lucide-react";
import type { ResourceFormProps } from "@/components/editor/resource-editor";
import { BackendRefsEditor, ParentRefsSection, rows, strings } from "@/components/forms/httproute-form";
import { FormSection, RemoveRowButton, StringListEditor } from "@/components/forms/shared";
import { Button } from "@/components/ui/button";
import { deleteAtPath, getAtPath, setAtPath } from "@/lib/object-path";

/** TLS passthrough routes: parents + SNI hostnames + backend-only rules. */
export function TlsRouteForm({ doc, onChange }: ResourceFormProps) {
  const hostnames = strings(getAtPath(doc, ["spec", "hostnames"]));
  const rules = rows(getAtPath(doc, ["spec", "rules"]));

  return (
    <>
      <ParentRefsSection doc={doc} onChange={onChange} />

      <FormSection
        title="SNI hostnames"
        description="TLS routing matches on SNI — at least one hostname is required."
      >
        <StringListEditor
          values={hostnames}
          onChange={(next) =>
            onChange(
              next.length === 0
                ? deleteAtPath(doc, ["spec", "hostnames"])
                : setAtPath(doc, ["spec", "hostnames"], next),
            )
          }
          placeholder="secure.example.com"
        />
      </FormSection>

      <FormSection
        title="Rules"
        description="Each rule forwards matched TLS streams to its backends."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange(setAtPath(doc, ["spec", "rules", rules.length], { backendRefs: [] }))
            }
          >
            <Plus className="size-3.5" /> Add rule
          </Button>
        }
      >
        {rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">At least one rule is required.</p>
        ) : (
          <div className="space-y-4">
            {rules.map((_, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Rule {i + 1}</p>
                  <RemoveRowButton
                    onClick={() => onChange(deleteAtPath(doc, ["spec", "rules", i]))}
                    label={`Remove rule ${i + 1}`}
                  />
                </div>
                <BackendRefsEditor doc={doc} onChange={onChange} rulePath={["spec", "rules", i]} />
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </>
  );
}
