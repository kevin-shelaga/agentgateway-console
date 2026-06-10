"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { ResourceEditor } from "@/components/editor/resource-editor";
import { FORMS } from "@/components/forms";
import { resourceIcon } from "@/components/icon-map";
import {
  ClusterUnreachable,
  PageHeader,
  ResourceError,
  TableSkeleton,
} from "@/components/page-states";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ApiError, CLUSTER_SEGMENT } from "@/lib/api-client";
import { useResource } from "@/lib/hooks";
import { getResource } from "@/lib/registry";
import { toEditableResource } from "@/lib/yaml-utils";

export default function EditResourcePage({
  params,
}: {
  params: Promise<{ kind: string; namespace: string; name: string }>;
}) {
  const { kind, namespace: nsParam, name: rawName } = use(params);
  const desc = getResource(kind);
  if (!desc || desc.readOnly) notFound();

  const name = decodeURIComponent(rawName);
  const namespace = nsParam === CLUSTER_SEGMENT ? undefined : decodeURIComponent(nsParam);
  const { data: res, isLoading, error } = useResource(desc, namespace, name);

  const Icon = resourceIcon(desc.icon);
  const apiError = error instanceof ApiError ? error.parsed : null;

  return (
    <div className="flex min-h-svh flex-col gap-5 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/resources/${desc.id}`}>{desc.labelPlural}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/resources/${desc.id}/${nsParam}/${rawName}`} className="k8s-id">
                {name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Edit</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <Icon className="size-5 text-primary" />
            Edit <span className="font-mono">{name}</span>
          </span>
        }
        description={`${desc.label} · ${namespace ?? "cluster-scoped"}`}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : apiError && apiError.status >= 500 ? (
        <ClusterUnreachable error={apiError.message} />
      ) : apiError ? (
        <ResourceError error={apiError} />
      ) : res ? (
        <ResourceEditor
          key={res.metadata.resourceVersion}
          desc={desc}
          initial={toEditableResource(res)}
          mode="update"
          Form={FORMS[desc.id]}
        />
      ) : null}
    </div>
  );
}
