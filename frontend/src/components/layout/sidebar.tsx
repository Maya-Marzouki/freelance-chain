"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, X } from "lucide-react";
import { useAppStore } from "@/components/providers/app-store";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { APP_NAV, isActive } from "./navigation";

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {APP_NAV.map((item) => {
        const active = pathname ? isActive(pathname, item) : false;
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] transition-colors",
                  active ? "text-brand-400" : "text-slate-500 group-hover:text-slate-300",
                )}
                aria-hidden
              />
              {item.label}
              {active && <span className="ml-auto size-1.5 rounded-full bg-cyan-400" aria-hidden />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Reads the pathname; must render under Suspense when cacheComponents is on. */
function ActiveNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} onNavigate={onNavigate} />;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { mode } = useAppStore();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo href="/" light />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Workspace</p>
        <Suspense fallback={<NavLinks pathname={null} onNavigate={onNavigate} />}>
          <ActiveNavLinks onNavigate={onNavigate} />
        </Suspense>
      </nav>
      <div className="m-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <ShieldCheck className="size-4 text-cyan-400" aria-hidden />
          {mode === "chain" ? "Live · Hardhat" : "Demo mode"}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          {mode === "chain"
            ? "Agreements are read from and written to the ServiceAgreement contract on your local blockchain."
            : "Data and transactions are simulated locally. Connect MetaMask to the Hardhat network to go live."}
        </p>
      </div>
    </div>
  );
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-navy-900 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", mobileOpen ? "visible" : "invisible")} aria-hidden={!mobileOpen}>
        <div
          className={cn(
            "absolute inset-0 bg-navy-900/50 backdrop-blur-[2px] transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={onClose}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-navy-900 shadow-2xl transition-transform duration-300",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-3 cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
          <SidebarContent onNavigate={onClose} />
        </aside>
      </div>
    </>
  );
}
