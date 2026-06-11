"use client";

import { FlaskConical, KeyRound, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AgentgatewayLogo } from "@/components/agentgateway-logo";
import { ClusterStatus } from "@/components/cluster-status";
import { resourceIcon } from "@/components/icon-map";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ALL_RESOURCES } from "@/lib/registry";

const GATEWAY_API_IDS = ["gatewayclasses", "gateways", "httproutes", "grpcroutes"];
const AGENTGATEWAY_IDS = ["backends", "policies", "parameters"];
const ENTERPRISE_IDS = ["ent-backends", "ent-policies", "ent-parameters", "ent-listenersets"];

function NavGroup({
  label,
  ids,
  children,
}: {
  label: string;
  ids: string[];
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] tracking-[0.18em] uppercase">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {ids.map((id) => {
            const desc = ALL_RESOURCES.find((r) => r.id === id)!;
            const Icon = resourceIcon(desc.icon);
            const href = `/resources/${desc.id}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton asChild isActive={active} tooltip={desc.labelPlural}>
                  <Link href={href}>
                    <Icon />
                    <span>{desc.labelPlural}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
          {children}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2.5 px-1.5 py-1">
          <AgentgatewayLogo className="size-7 shrink-0" />
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm leading-tight font-semibold tracking-tight">
              agentgateway
            </span>
            <span className="text-[10px] leading-tight tracking-[0.22em] text-muted-foreground uppercase">
              console
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="Dashboard">
                  <Link href="/">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/playground"}
                  tooltip="Playground"
                >
                  <Link href="/playground">
                    <FlaskConical />
                    <span>Playground</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavGroup label="Gateway API" ids={GATEWAY_API_IDS} />
        <NavGroup label="Agentgateway" ids={AGENTGATEWAY_IDS}>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/api-keys" || pathname.startsWith("/api-keys/")}
              tooltip="API Keys"
            >
              <Link href="/api-keys">
                <KeyRound />
                <span>API Keys</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </NavGroup>
        <NavGroup label="Enterprise" ids={ENTERPRISE_IDS} />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:flex-col">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:w-full">
            <ClusterStatus />
          </div>
          <span className="group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
