"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/components/auth/auth-provider";
import type { UserRole } from "@/lib/profile";
import { SpaceProvider } from "./space-provider";

/**
 * Access control of a role space: visitors without an account go to the login page, and a user
 * who opens the other role's space is moved to their own.
 */
export function SpaceShell({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { status, profile } = useAuth();
  const router = useRouter();

  const allowed = status === "authenticated" && profile?.role === role;

  useEffect(() => {
    if (status === "anonymous" || status === "unregistered") {
      router.replace(status === "unregistered" ? "/signup" : "/login");
    } else if (status === "authenticated" && profile && profile.role !== role) {
      // Read in the browser: `usePathname` would block prerendering of the dynamic pages.
      router.replace(window.location.pathname.replace(/^\/(client|freelancer)/, `/${profile.role}`));
    }
  }, [status, profile, role, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" aria-busy="true" aria-label="Checking your session">
        <Skeleton className="h-40 w-full max-w-md rounded-2xl" />
      </div>
    );
  }

  return (
    <SpaceProvider role={role}>
      <AppShell>{children}</AppShell>
    </SpaceProvider>
  );
}
