"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { ConditionsCard } from "@/components/conditions-card";
import { resourceIcon } from "@/components/icon-map";
import {
  ClusterUnreachable,
  PageHeader,
  ResourceError,
  TableSkeleton,
} from "@/components/page-states";
import { RelatedResources } from "@/components/related-resources";
import { StatusBadge } from "@/components/status-badge";
import { YamlView } from "@/components/yaml-view";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, CLUSTER_SEGMENT } from "@/lib/api-client";
import { formatAge } from "@/lib/format";
import { useDeleteResource, useResource } from "@/lib/hooks";
import { getResource } from "@/lib/registry";
import { toDisplayYaml } from "@/lib/yaml-utils";

export default function ResourceDetailPage({
  params,
}: {
  params: Promise<{ kind: string; namespace: string; name: string }>;
}) {
  const { kind, namespace: nsParam, name: rawName } = use(params);
  const desc = getResource(kind);
  if (!desc) notFound();

  const name = decodeURIComponent(rawName);
  const namespace = nsParam === CLUSTER_SEGMENT ? undefined : decodeURIComponent(nsParam);
  const router = useRouter();
  const { data: res, isLoading, error } = useResource(desc, namespace, name);
  const remove = useDeleteResource(desc);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const Icon = resourceIcon(desc.icon);
  const apiError = error instanceof ApiError ? error.parsed : null;

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync({ namespace, name });
      toast.success(`${desc.kind} ${name} deleted`);
      router.push(`/resources/${desc.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.parsed.message : String(err));
    } finally {
      setConfirmingDelete(false);
    }
  };

  const status = res ? desc.getStatus(res) : null;
  const labels = res?.metadata.labels ?? {};

  return (
    <div className="flex flex-col gap-5 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/resources/${desc.id}`}>{desc.labelPlural}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {namespace && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="k8s-id">{namespace}</BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbPage className="k8s-id">{name}</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <Icon className="size-5 text-primary" />
            <span className="font-mono">{name}</span>
            {status && <StatusBadge state={status.state} className="ml-1" />}
          </span>
        }
        description={status?.message || desc.label}
      >
        {!desc.readOnly && (
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`/resources/${desc.id}/${nsParam}/${rawName}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </>
        )}
      </PageHeader>

      {isLoading ? (
        <TableSkeleton />
      ) : apiError && apiError.status >= 500 ? (
        <ClusterUnreachable error={apiError.message} />
      ) : apiError ? (
        <ResourceError error={apiError} />
      ) : res ? (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Kind</span>
                  <span className="k8s-id">{res.apiVersion} · {res.kind}</span>
                </div>
                {namespace && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Namespace</span>
                    <span className="k8s-id">{namespace}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Created</span>
                  <span className="tabular-nums">
                    {formatAge(res.metadata.creationTimestamp)} ago
                  </span>
                </div>
                {Object.keys(labels).length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-muted-foreground">Labels</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(labels).map(([k, v]) => (
                        <Badge key={k} variant="secondary" className="font-mono text-[11px] font-normal">
                          {k}={v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {status && <ConditionsCard conditions={status.conditions} />}
            <div className="lg:col-span-2">
              <RelatedResources res={res} />
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="mt-4">
            <YamlView yaml={toDisplayYaml(res)} />
          </TabsContent>
        </Tabs>
      ) : null}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {desc.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="k8s-id text-foreground">
                {namespace ? `${namespace}/` : ""}
                {name}
              </span>{" "}
              from the cluster.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
