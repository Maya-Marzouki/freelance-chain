"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn, shortenAddress } from "@/lib/utils";

/** Monospace shortened address/hash with a copy-to-clipboard button. */
export function CopyValue({
  value,
  chars = 4,
  className,
  label = "Copy",
}: {
  value: string;
  chars?: number;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs text-slate-600", className)}>
      <span title={value}>{shortenAddress(value, chars)}</span>
      <button
        type="button"
        onClick={copy}
        className="cursor-pointer rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label={copied ? "Copied" : label}
      >
        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}

/** Gradient avatar derived from an address. */
export function AddressAvatar({
  address,
  size = 32,
  className,
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  const n = Number.parseInt(address.slice(2, 10) || "0", 16);
  const hue1 = n % 360;
  const hue2 = (hue1 + 60 + (n % 90)) % 360;
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full ring-2 ring-white", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue1} 75% 62%), hsl(${hue2} 70% 52%))`,
      }}
    />
  );
}
