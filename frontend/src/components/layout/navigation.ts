import {
  Activity,
  Briefcase,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/profile";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact path (used where a child route has its own item). */
  exact?: boolean;
}

/** Navigation of each role's space. Hrefs are relative to the space (`/agreements` is `/client/agreements`). */
const NAV: Record<UserRole, NavItem[]> = {
  client: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/agreements", label: "My Agreements", icon: FileText, exact: true },
    { href: "/agreements/create", label: "Create Agreement", icon: FilePlus2 },
    { href: "/escrow", label: "Escrow & Milestones", icon: LockKeyhole },
    { href: "/activity", label: "Activity History", icon: Activity },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
  // Freelancers do not create agreements: they receive, accept and deliver them.
  freelancer: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/agreements", label: "My Jobs", icon: Briefcase, exact: true },
    { href: "/escrow", label: "Milestones & Earnings", icon: Wallet },
    { href: "/activity", label: "Activity History", icon: Activity },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
};

export const navFor = (role: UserRole): NavItem[] => NAV[role];

/** `/client/agreements/1` -> `/agreements/1`. */
export const stripSpace = (pathname: string) => pathname.replace(/^\/(client|freelancer)(?=\/|$)/, "") || "/";

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
  { href: "/login", label: "Sign in" },
];
