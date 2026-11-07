"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { homeOf, type UserRole } from "@/lib/profile";
import { useSpace } from "./space-provider";

/** Page reserved for one role: the other role is told why and sent back to their dashboard. */
export function RoleOnly({ role, what, children }: { role: UserRole; what: string; children: React.ReactNode }) {
  const space = useSpace();
  const router = useRouter();
  const allowed = space === role;

  useEffect(() => {
    if (space && !allowed) {
      const timer = setTimeout(() => router.replace(homeOf(space)), 2500);
      return () => clearTimeout(timer);
    }
  }, [space, allowed, router]);

  if (allowed) return <>{children}</>;
  return (
    <Card>
      <EmptyState
        icon={<ShieldAlert />}
        title={`${what} is reserved for the ${role} space`}
        description="Your account has a different role. You are being redirected to your dashboard."
        action={space ? <ButtonLink href={homeOf(space)}>Go to my dashboard</ButtonLink> : undefined}
      />
    </Card>
  );
}
