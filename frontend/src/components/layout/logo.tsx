import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#101828" />
      <path d="M10 11.5 16 8l6 3.5v7L16 22l-6-3.5z" fill="none" stroke="#7357FF" strokeWidth="2" strokeLinejoin="round" />
      <path d="m16 15 6-3.5M16 15v7M16 15l-6-3.5" stroke="#24C8DB" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, href = "/", light }: { className?: string; href?: string; light?: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)} aria-label="FreeLance Chain home">
      <LogoMark />
      <span className={cn("text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-navy-900")}>
        FreeLance <span className="text-brand-500">Chain</span>
      </span>
    </Link>
  );
}
