"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/misc";
import { homeOf } from "@/lib/profile";
import { useAuth } from "./auth-provider";

/** Sends the user to their space, or to the login page when nobody is signed in. */
export function RoleRedirect() {
  const { status, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && profile) router.replace(homeOf(profile.role));
    else if (status === "unregistered") router.replace("/signup");
    else if (status === "anonymous") router.replace("/login");
  }, [status, profile, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4" aria-busy="true">
      <Skeleton className="h-24 w-64 rounded-2xl" />
    </div>
  );
}
