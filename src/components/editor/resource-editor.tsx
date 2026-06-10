"use client";

import { FileWarning, Loader2, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parse, stringify } from "yaml";
import { ValidationPanel } from "@/components/editor/validation-panel";
import { MetadataFields } from "@/components/editor/metadata-fields";
import { YamlEditor } from "@/components/yaml-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api-client";
import { useDryRun, useSaveResource, useSchema } from "@/lib/hooks";
import type { ParsedK8sError } from "@/lib/k8s/errors";
import type { K8sResource, ResourceDescriptor } from "@/lib/types";
import { compileValidator } from "@/lib/validation";
import { cn } from "@/lib/utils";

export interface ResourceFormProps {
  doc: K8sResource;
  onChange: (doc: K8sResource) => void;
}

type ViewMode = "split" | "form" | "yaml";

export function ResourceEditor({
  desc,
  initial,
  mode,
  Form,
}: {
  desc: ResourceDescriptor;
  initial: K8sResource;
  mode: "create" | "update";
  Form?: React.ComponentType<ResourceFormProps>;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<K8sResource>(initial);
  const [text, setText] = useState(() => stringify(initial, { indent: 2 }));
  const [yamlParseError, setYamlParseError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("split");
  const [dryRunError, setDryRunError] = useState<ParsedK8sError | null>(null);
  const [dryRunOk, setDryRunOk] = useState(false);

  const { data: schemaData } = useSchema(desc.crdName);
  const schema = (schemaData?.versions?.[desc.version] as object | undefined) ?? null;

  const schemaIssues = useMemo(() => {
    if (!schema || yamlParseError) return [];
    try {
      return compileValidator(schema)(doc);
    } catch {
      return [];
    }
  }, [schema, doc, yamlParseError]);

  function resetVerdicts() {
    setDryRunError(null);
    setDryRunOk(false);
  }

  /** Form edits drive both the object and the YAML text. */
  function handleFormChange(next: K8sResource) {
    setDoc(next);
    setText(stringify(next, { indent: 2 }));
    setYamlParseError(null);
    resetVerdicts();
  }

  /** YAML edits drive the object; parse failures freeze the form, never the editor. */
  function handleYamlChange(nextText: string) {
    setText(nextText);
    resetVerdicts();
    try {
      const parsed = parse(nextText) as K8sResource;
      if (!parsed || typeof parsed !== "object") {
        setYamlParseError("document must be a YAML mapping");
        return;
      }
      setDoc(parsed);
      setYamlParseError(null);
    } catch (err) {
      setYamlParseError(err instanceof Error ? err.message.split("\n")[0] : String(err));
    }
  }

  const save = useSaveResource(desc);
  const dryRun = useDryRun();

  async function handleDryRun() {
    resetVerdicts();
    try {
      await dryRun.mutateAsync({ manifest: doc, mode });
      setDryRunOk(true);
    } catch (err) {
      if (err instanceof ApiError) setDryRunError(err.parsed);
      else toast.error(String(err));
    }
  }

  async function handleSave() {
    resetVerdicts();
    try {
      const saved = await save.mutateAsync({ manifest: doc, mode });
      toast.success(`${desc.kind} ${saved.metadata.name} ${mode === "create" ? "created" : "updated"}`);
      const ns = desc.scope === "Cluster" ? "_cluster" : (saved.metadata.namespace ?? "default");
      router.push(`/resources/${desc.id}/${ns}/${saved.metadata.name}`);
    } catch (err) {
      if (err instanceof ApiError) setDryRunError(err.parsed);
      else toast.error(String(err));
    }
  }

  const busy = save.isPending || dryRun.isPending;
  const showForm = view !== "yaml";
  const showYaml = view !== "form";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="split" className="px-3 text-xs">
              Split
            </TabsTrigger>
            <TabsTrigger value="form" className="px-3 text-xs">
              Form
            </TabsTrigger>
            <TabsTrigger value="yaml" className="px-3 text-xs">
              YAML
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {schemaData && (
          <span className="text-xs text-muted-foreground">
            schema: <span className="k8s-id">{schemaData.source}</span>
          </span>
        )}
      </div>

      <ValidationPanel
        schemaIssues={schemaIssues}
        dryRunError={dryRunError}
        dryRunOk={dryRunOk}
      />

      {yamlParseError && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3.5 py-2.5 text-xs text-warning">
          <FileWarning className="size-3.5 shrink-0" />
          YAML parse error — form is paused until the document parses: {yamlParseError}
        </div>
      )}

      <div
        className={cn(
          "grid min-h-0 flex-1 items-start gap-4",
          showForm && showYaml && "xl:grid-cols-2",
        )}
      >
        {showForm && (
          <div
            className={cn(
              "flex min-w-0 flex-col gap-4",
              yamlParseError && "pointer-events-none opacity-50",
            )}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <MetadataFields desc={desc} doc={doc} mode={mode} onChange={handleFormChange} />
              </CardContent>
            </Card>
            {Form ? (
              <Form doc={doc} onChange={handleFormChange} />
            ) : (
              <p className="px-1 text-xs text-muted-foreground">
                No guided form for {desc.label} yet — use the YAML editor; schema validation and
                dry-run still apply.
              </p>
            )}
          </div>
        )}

        {showYaml && (
          <div className="min-w-0 overflow-hidden rounded-lg border bg-card xl:sticky xl:top-4">
            <YamlEditor value={text} onChange={handleYamlChange} schema={schema} height="100%" />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-2 border-t bg-background/80 px-6 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
        <Button variant="outline" size="sm" onClick={handleDryRun} disabled={busy || !!yamlParseError}>
          {dryRun.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          Validate (dry-run)
        </Button>
        <Button size="sm" onClick={handleSave} disabled={busy || !!yamlParseError}>
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {mode === "create" ? "Create" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
