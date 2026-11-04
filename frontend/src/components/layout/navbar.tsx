"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { LANDING_NAV } from "./navigation";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-200",
        scrolled || open
          ? "border-b border-slate-200/80 bg-white/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />
        <ul className="ml-6 hidden items-center gap-1 md:flex">
          {LANDING_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:text-navy-900"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <ConnectWallet className="hidden sm:block" />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="animate-fade-in border-t border-slate-100 bg-white px-4 pt-2 pb-4 md:hidden">
          <ul className="space-y-1">
            {LANDING_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ConnectWallet className="mt-3 sm:hidden" />
        </div>
      )}
    </header>
  );
}
