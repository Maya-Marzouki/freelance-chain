import {
  Activity,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact path (used where a child route has its own item). */
  exact?: boolean;
}

export const APP_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agreements", label: "My Agreements", icon: FileText, exact: true },
  { href: "/agreements/create", label: "Create Agreement", icon: FilePlus2 },
  { href: "/escrow", label: "Escrow & Milestones", icon: LockKeyhole },
  { href: "/activity", label: "Activity History", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) {
    // "/agreements" should also be active on details pages, but not on /create.
    if (item.href === "/agreements") {
      return pathname === "/agreements" || (pathname.startsWith("/agreements/") && pathname !== "/agreements/create");
    }
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const LANDING_NAV = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#stats", label: "Network" },
  { href: "/dashboard", label: "Dashboard" },
];
