import type { Metadata } from "next";
import { RoleRedirect } from "@/components/auth/role-redirect";

export const metadata: Metadata = { title: "Dashboard" };

/** Old entry point: sends the visitor to the dashboard of their role, or to the login page. */
export default function DashboardRedirect() {
  return <RoleRedirect />;
}
