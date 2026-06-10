import {
  Box,
  DoorOpen,
  KeyRound,
  LayoutDashboard,
  Layers,
  Network,
  Route,
  Server,
  Settings2,
  ShieldCheck,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

/** Registry descriptors carry icon names (server-safe); this maps them to components. */
export const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  layers: Layers,
  doorOpen: DoorOpen,
  route: Route,
  waypoints: Waypoints,
  server: Server,
  shieldCheck: ShieldCheck,
  settings2: Settings2,
  box: Box,
  network: Network,
  keyRound: KeyRound,
};

export function resourceIcon(name: string): LucideIcon {
  return ICONS[name] ?? Box;
}
