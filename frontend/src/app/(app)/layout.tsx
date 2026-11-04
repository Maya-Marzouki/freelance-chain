import { AppShell } from "@/components/layout/app-shell";

/** Shared dashboard chrome (sidebar + topbar) for all application routes. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
