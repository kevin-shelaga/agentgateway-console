"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useResourceList, useResourceListOptional } from "@/lib/hooks";
import { getIncomingRefs, getReferences } from "@/lib/references";
import { ENTERPRISE_RESOURCES, getResource, RESOURCES } from "@/lib/registry";
import type { K8sResource } from "@/lib/types";

function refHref(descId: string | undefined, namespace: string | undefined, name: string) {
  if (!descId) return null;
  const desc = getResource(descId);
  if (!desc) return null;
  const ns = desc.scope === "Cluster" ? "_cluster" : (namespace ?? "default");
  return `/resources/${descId}/${ns}/${name}`;
}

function RefRow({
  direction,
  kind,
  name,
  namespace,
  relation,
  href,
}: {
  direction: "out" | "in";
  kind: string;
  name: string;
  namespace?: string;
  relation: string;
  href: string | null;
}) {
  const Arrow = direction === "out" ? ArrowUpRight : ArrowDownLeft;
  const label = (
    <span className="k8s-id">
      {namespace ? `${namespace}/` : ""}
      {name}
    </span>
  );
  return (
    <li className="flex items-center gap-2 text-sm">
      <Arrow className="size-3.5 shrink-0 text-muted-foreground" />
      <Badge variant="outline" className="font-normal">
        {kind}
      </Badge>
      {href ? (
        <Link href={href} className="truncate hover:text-primary">
          {label}
        </Link>
      ) : (
        <span className="truncate text-muted-foreground">{label}</span>
      )}
      <span className="ml-auto text-xs text-muted-foreground">{relation}</span>
    </li>
  );
}

/**
 * Related panel: outgoing spec references plus incoming references found by
 * scanning cached lists of route/policy kinds (cheap client-side join).
 */
export function RelatedResources({ res }: { res: K8sResource }) {
  const outgoing = getReferences(res);

  // Kinds that can point at other resources; their lists feed the incoming scan.
  const httproutes = useResourceList(RESOURCES.find((r) => r.id === "httproutes")!);
  const grpcroutes = useResourceList(RESOURCES.find((r) => r.id === "grpcroutes")!);
  const policies = useResourceList(RESOURCES.find((r) => r.id === "policies")!);
  const gateways = useResourceList(RESOURCES.find((r) => r.id === "gateways")!);
  // Optional kinds (CRDs may be absent): TLS routes and enterprise policies.
  const tlsroutes = useResourceListOptional(RESOURCES.find((r) => r.id === "tlsroutes")!);
  const entPolicies = useResourceListOptional(ENTERPRISE_RESOURCES.find((r) => r.id === "ent-policies")!);

  const candidates = [
    ...(httproutes.data ?? []),
    ...(grpcroutes.data ?? []),
    ...(tlsroutes.data ?? []),
    ...(policies.data ?? []),
    ...(entPolicies.data ?? []),
    ...(gateways.data ?? []),
  ].filter(
    (c) => !(c.kind === res.kind && c.metadata.name === res.metadata.name && c.metadata.namespace === res.metadata.namespace),
  );
  const incoming = getIncomingRefs(res, candidates);

  if (outgoing.length === 0 && incoming.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Related resources</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {outgoing.map((r, i) => (
            <RefRow
              key={`out-${i}`}
              direction="out"
              kind={r.kind}
              name={r.name}
              namespace={r.namespace}
              relation={r.relation}
              href={refHref(r.descId, r.namespace, r.name)}
            />
          ))}
          {incoming.map(({ source, relation }, i) => {
            const descId = [...RESOURCES, ...ENTERPRISE_RESOURCES].find((d) => d.kind === source.kind)?.id;
            return (
              <RefRow
                key={`in-${i}`}
                direction="in"
                kind={source.kind}
                name={source.metadata.name}
                namespace={source.metadata.namespace}
                relation={`references this as ${relation}`}
                href={refHref(descId, source.metadata.namespace, source.metadata.name)}
              />
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
