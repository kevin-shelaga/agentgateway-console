"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useMemo } from "react";
import { ResourceEditor } from "@/components/editor/resource-editor";
import { FORMS } from "@/components/forms";
import { resourceIcon } from "@/components/icon-map";
import { PageHeader } from "@/components/page-states";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getResource } from "@/lib/registry";

export default function NewResourcePage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = use(params);
  const desc = getResource(kind);
  if (!desc || desc.readOnly) notFound();

  const initial = useMemo(() => desc.template("default"), [desc]);
  const Icon = resourceIcon(desc.icon);

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
          <BreadcrumbPage>New</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <Icon className="size-5 text-primary" />
            Create {desc.label}
          </span>
        }
        description={desc.description}
      />

      <ResourceEditor desc={desc} initial={initial} mode="create" Form={FORMS[desc.id]} />
    </div>
  );
}
