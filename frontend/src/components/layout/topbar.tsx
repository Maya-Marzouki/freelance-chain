"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { AddressAvatar } from "@/components/ui/address";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { useAppStore } from "@/components/providers/app-store";
import { MOCK_NOTIFICATIONS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function GlobalSearch() {
  const { agreements } = useAppStore();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return agreements
      .filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.client.name.toLowerCase().includes(q) ||
          a.freelancer.name.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [agreements, query]);

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) {
            router.push(`/agreements/${results[0].id}`);
            setOpen(false);
            setQuery("");
          }
        }}
      >
        <label htmlFor="global-search" className="sr-only">
          Search agreements
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id="global-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search agreements, parties, IDs…"
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100 focus:outline-none"
        />
      </form>
      {open && query.trim() && (
        <div className="absolute inset-x-0 z-50 mt-2 animate-slide-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-elevated">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No agreements match “{query}”.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/agreements/${a.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy-900">{a.title}</span>
                      <span className="block text-xs text-slate-500">
                        {a.id} · {a.freelancer.name}
                      </span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(MOCK_NOTIFICATIONS);
  const ref = useDismiss(open, () => setOpen(false));
  const unread = items.filter((n) => n.unread).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-navy-900"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-500 ring-2 ring-white" aria-hidden />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-slide-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-elevated">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => setItems((ns) => ns.map((n) => ({ ...n, unread: false })))}
                className="cursor-pointer text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Mark all as read
              </button>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 px-4 py-3">
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread ? "bg-brand-500" : "bg-transparent")}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900">{n.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{n.time}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/activity"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-slate-50"
          >
            View all activity
          </Link>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAppStore();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          className="-ml-1 flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <div className="hidden flex-1 sm:block">
          <GlobalSearch />
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <Notifications />
          <ConnectWallet compact />
          <Link
            href="/settings"
            className="hidden items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 transition hover:bg-slate-100 md:flex"
            aria-label="Profile settings"
          >
            <AddressAvatar address={user.address} size={32} className="ring-0" />
            <span className="hidden text-left xl:block">
              <span className="block text-sm leading-tight font-medium text-navy-900">{user.name}</span>
              <span className="block text-xs leading-tight text-slate-500">{user.title}</span>
            </span>
          </Link>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-2 sm:hidden">
        <GlobalSearch />
      </div>
    </header>
  );
}
