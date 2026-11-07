"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/profile";

/** Role of the space being browsed (`/client/...` or `/freelancer/...`). Null outside a space. */
const SpaceContext = createContext<UserRole | null>(null);

export function SpaceProvider({ role, children }: { role: UserRole; children: React.ReactNode }) {
  return <SpaceContext.Provider value={role}>{children}</SpaceContext.Provider>;
}

export function useSpace(): UserRole | null {
  return useContext(SpaceContext);
}

/** Pages that exist inside each role's space. */
const SPACE_PAGES = ["/dashboard", "/agreements", "/escrow", "/activity", "/settings"];

/** Prefixes an in-app path with the space (`/agreements/1` -> `/client/agreements/1`). Other paths are untouched. */
export function spacePath(role: UserRole | null, href: string): string {
  if (!role) return href;
  const inSpace = SPACE_PAGES.some((p) => href === p || (href.startsWith(p) && "/?#".includes(href.charAt(p.length))));
  return inSpace ? `/${role}${href}` : href;
}
