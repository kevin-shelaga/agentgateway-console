"use client";

import { KeyRound, MoreHorizontal, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NamespaceFilter } from "@/components/namespace-filter";
import {
  ClusterUnreachable,
  PageHeader,
  ResourceError,
  TableSkeleton,
} from "@/components/page-states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";
import { formatAge } from "@/lib/format";
import { useNamespaces, useResourceList } from "@/lib/hooks";
import {
  PROVIDER_LABEL,
  useCreateLlmKey,
  useDeleteLlmKey,
  useLlmKeys,
  useRotateLlmKey,
  type LlmKeyMeta,
} from "@/lib/llm-keys-client";
import { getResource } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";

const PROVIDER_HINTS = [
  "openai",
  "anthropic",
  "gemini",
  "vertexai",
  "bedrock",
  "azureopenai",
  "azure",
  "custom",
];
const NO_PROVIDER = "__none__";

const backendsDesc = getResource("backends")!;

/** Backends consuming a key via spec.policies.auth.secretRef (same namespace). */
function referencedBy(key: LlmKeyMeta, backends: K8sResource[]): K8sResource[] {
  return backends.filter((b) => {
    if (b.metadata.namespace !== key.namespace) return false;
    const policies = (b.spec?.policies ?? {}) as Record<string, unknown>;
    const auth = (policies.auth ?? {}) as Record<string, unknown>;
    const secretRef = (auth.secretRef ?? {}) as Record<string, unknown>;
    return secretRef.name === key.name;
  });
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.parsed.message : String(err);
}

export default function ApiKeysPage() {
  const [namespace, setNamespace] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<LlmKeyMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LlmKeyMeta | null>(null);

  const { data: keys, isLoading, error, refetch, isRefetching } = useLlmKeys(namespace);
  const { data: backends } = useResourceList(backendsDesc);
  const deleteKey = useDeleteLlmKey();

  const items = useMemo(() => keys ?? [], [keys]);
  const apiError = error instanceof ApiError ? error.parsed : null;
  const unreachable = apiError && (apiError.status >= 500 || apiError.status === 0);
  const deleteRefs = deleteTarget ? referencedBy(deleteTarget, backends ?? []) : [];

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { namespace: ns, name } = deleteTarget;
    try {
      await deleteKey.mutateAsync({ namespace: ns, name });
      toast.success(`API key ${name} deleted`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <KeyRound className="size-5 text-primary" />
            API Keys
            {keys && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">
                {items.length}
              </span>
            )}
          </span>
        }
        description="LLM provider credentials stored as Opaque Secrets with an Authorization entry, consumed by Backend auth (spec.policies.auth.secretRef)"
      >
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Create API key
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <NamespaceFilter value={namespace} onChange={setNamespace} />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => refetch()}
          aria-label="Refresh"
        >
          <RefreshCw className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : unreachable ? (
        <ClusterUnreachable error={apiError.message} />
      ) : apiError ? (
        <ResourceError error={apiError} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-24 text-center">
          <div className="space-y-1">
            <p className="font-medium">No API keys yet</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Store an LLM provider key as a Kubernetes Secret, then reference it from a
              Backend&apos;s auth settings.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create API key
          </Button>
        </div>
      ) : (
        <KeyTable
          items={items}
          backends={backends ?? []}
          onRotate={setRotateTarget}
          onDelete={setDeleteTarget}
        />
      )}

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RotateKeyDialog target={rotateTarget} onOpenChange={(open) => !open && setRotateTarget(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the secret{" "}
              <span className="k8s-id text-foreground">
                {deleteTarget?.namespace}/{deleteTarget?.name}
              </span>{" "}
              from the cluster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteRefs.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
              <p className="font-medium text-destructive">
                Still referenced by {deleteRefs.length} backend{deleteRefs.length > 1 ? "s" : ""} —
                deleting it will break their authentication:
              </p>
              <ul className="mt-1 space-y-0.5">
                {deleteRefs.map((b) => (
                  <li key={b.metadata.name} className="k8s-id text-foreground">
                    {b.metadata.namespace}/{b.metadata.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KeyTable({
  items,
  backends,
  onRotate,
  onDelete,
}: {
  items: LlmKeyMeta[];
  backends: K8sResource[];
  onRotate: (key: LlmKeyMeta) => void;
  onDelete: (key: LlmKeyMeta) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Namespace</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Referenced by</TableHead>
            <TableHead className="w-16">Age</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((key) => {
            const provider = key.labels?.[PROVIDER_LABEL];
            const refs = referencedBy(key, backends);
            return (
              <TableRow key={`${key.namespace}/${key.name}`}>
                <TableCell className="k8s-id font-medium">{key.name}</TableCell>
                <TableCell className="k8s-id text-muted-foreground">{key.namespace}</TableCell>
                <TableCell>
                  {provider ? (
                    <Badge variant="secondary" className="font-mono font-normal">
                      {provider}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {key.managed ? (
                    <Badge variant="secondary" className="gap-1.5 font-normal">
                      <span className="status-dot status-dot-healthy" />
                      managed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1.5 font-normal">
                      <span className="status-dot status-dot-unknown" />
                      external
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {refs.length === 0 ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    <span className="flex max-w-72 flex-wrap gap-1">
                      {refs.map((b) => (
                        <Link
                          key={b.metadata.name}
                          href={`/resources/backends/${b.metadata.namespace}/${b.metadata.name}`}
                          className="k8s-id text-foreground hover:text-primary"
                        >
                          {b.metadata.name}
                        </Link>
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground tabular-nums">
                  {formatAge(key.creationTimestamp)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Actions for ${key.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onRotate(key)}>
                        <RotateCcw className="size-4" /> Rotate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={!key.managed}
                        onClick={() => onDelete(key)}
                      >
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: namespaces } = useNamespaces();
  const create = useCreateLlmKey();
  const [name, setName] = useState("");
  const [namespace, setNamespace] = useState("");
  const [provider, setProvider] = useState(NO_PROVIDER);
  const [apiKey, setApiKey] = useState("");

  function reset() {
    setName("");
    setNamespace("");
    setProvider(NO_PROVIDER);
    // The key never lingers in state after the dialog closes.
    setApiKey("");
  }

  async function submit() {
    try {
      await create.mutateAsync({
        name: name.trim(),
        namespace,
        apiKey,
        ...(provider !== NO_PROVIDER ? { providerHint: provider } : {}),
      });
      toast.success(`API key ${name.trim()} created`, {
        description: "Select it under Backend auth (spec.policies.auth.secretRef).",
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            Stored as an Opaque Secret with a single <span className="font-mono">Authorization</span>{" "}
            entry. The value is write-only: it never appears in this console again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="openai-key"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-namespace">Namespace</Label>
            <Select value={namespace || undefined} onValueChange={setNamespace}>
              <SelectTrigger id="key-namespace" className="w-full font-mono text-xs">
                <SelectValue placeholder="Select namespace" />
              </SelectTrigger>
              <SelectContent>
                {(namespaces ?? []).map((ns) => (
                  <SelectItem
                    key={ns.metadata.name}
                    value={ns.metadata.name}
                    className="font-mono text-xs"
                  >
                    {ns.metadata.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Must match the namespace of the backends that will use it.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-provider">Provider hint (optional)</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="key-provider" className="w-full font-mono text-xs">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROVIDER} className="text-xs">
                  None
                </SelectItem>
                {PROVIDER_HINTS.map((p) => (
                  <SelectItem key={p} value={p} className="font-mono text-xs">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-value">API key</Label>
            <Input
              id="key-value"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={!name.trim() || !namespace || !apiKey || create.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RotateKeyDialog({
  target,
  onOpenChange,
}: {
  target: LlmKeyMeta | null;
  onOpenChange: (open: boolean) => void;
}) {
  const rotate = useRotateLlmKey();
  const [apiKey, setApiKey] = useState("");

  async function submit() {
    if (!target) return;
    try {
      await rotate.mutateAsync({ namespace: target.namespace, name: target.name, apiKey });
      toast.success(`API key ${target.name} rotated`);
      setApiKey("");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog
      open={!!target}
      onOpenChange={(next) => {
        if (!next) setApiKey("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rotate API key</DialogTitle>
          <DialogDescription>
            Replaces the <span className="font-mono">Authorization</span> value of{" "}
            <span className="k8s-id text-foreground">
              {target?.namespace}/{target?.name}
            </span>
            . Backends pick up the new key automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rotate-value">New API key</Label>
          <Input
            id="rotate-value"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            className="font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!apiKey || rotate.isPending}>
            Rotate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
