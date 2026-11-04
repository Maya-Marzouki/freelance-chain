"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, LogOut, Network, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressAvatar, CopyValue } from "@/components/ui/address";
import { useToast } from "@/components/providers/toast-provider";
import { HARDHAT_CHAIN_ID } from "@/lib/ethereum";
import { cn, shortenAddress } from "@/lib/utils";
import { useWallet } from "./wallet-provider";

const METAMASK_URL = "https://metamask.io/download/";

interface Props {
  className?: string;
  /** Compact style for the dashboard topbar. */
  compact?: boolean;
  /** Use a dark button (e.g. on the landing hero). */
  variant?: "primary" | "dark" | "outline";
}

/**
 * Reusable wallet connection control: detects MetaMask, connects, shows the
 * shortened address & active network, and offers network switching and a
 * disconnect action.
 */
export function ConnectWallet({ className, compact, variant = "primary" }: Props) {
  const wallet = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !missingOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setMissingOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMissingOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, missingOpen]);

  async function handleConnect() {
    if (wallet.status === "unavailable") {
      setMissingOpen((v) => !v);
      return;
    }
    try {
      await wallet.connect();
      toast.success("Wallet connected", "Your MetaMask account is now linked.");
    } catch (err) {
      toast.error("Connection failed", (err as Error).message);
    }
  }

  async function handleSwitch() {
    try {
      await wallet.switchNetwork();
      toast.success("Network switched", `Connected to Hardhat Local (${HARDHAT_CHAIN_ID}).`);
    } catch (err) {
      toast.error("Could not switch network", (err as Error).message);
    }
  }

  async function handleDisconnect() {
    setOpen(false);
    await wallet.disconnect();
    toast.info("Wallet disconnected", "Reconnect at any time from the wallet button.");
  }

  if (wallet.status === "initializing") {
    return (
      <div
        className={cn("h-10 w-36 animate-pulse rounded-lg bg-slate-200/70", compact && "w-28", className)}
        aria-label="Detecting wallet"
      />
    );
  }

  if (wallet.status !== "connected" || !wallet.address) {
    return (
      <div ref={rootRef} className={cn("relative", className)}>
        <Button
          variant={variant}
          size={compact ? "sm" : "md"}
          onClick={handleConnect}
          loading={wallet.status === "connecting"}
          aria-expanded={wallet.status === "unavailable" ? missingOpen : undefined}
          className={compact ? "h-9" : undefined}
        >
          {wallet.status !== "connecting" && <Wallet className="size-4" aria-hidden />}
          {wallet.status === "connecting" ? "Connecting…" : "Connect Wallet"}
        </Button>
        {missingOpen && (
          <div className="absolute right-0 z-50 mt-2 w-72 animate-slide-up rounded-xl border border-slate-200 bg-white p-4 shadow-elevated">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <AlertTriangle className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-navy-900">MetaMask not detected</p>
                <p className="mt-1 text-sm text-slate-500">
                  Install the MetaMask browser extension to connect a wallet. You can still explore the demo without one.
                </p>
                <a
                  href={METAMASK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Get MetaMask <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const network = wallet.network;
  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white pr-2.5 pl-1.5 text-sm font-medium text-navy-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50",
          compact ? "h-9" : "h-10",
        )}
      >
        <AddressAvatar address={wallet.address} size={24} className="ring-0" />
        <span className="font-mono text-xs">{shortenAddress(wallet.address)}</span>
        {network && (
          <span
            className={cn(
              "hidden size-2 rounded-full sm:inline-block",
              network.isSupported ? "bg-emerald-500" : "bg-amber-500",
            )}
            title={network.name}
          />
        )}
        <ChevronDown className="size-4 text-slate-400" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 animate-slide-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-elevated"
        >
          <div className="border-b border-slate-100 p-4">
            <p className="text-xs font-medium text-slate-500">Connected with MetaMask</p>
            <div className="mt-2 flex items-center gap-3">
              <AddressAvatar address={wallet.address} size={36} className="ring-0" />
              <CopyValue value={wallet.address} chars={6} className="text-sm text-navy-900" label="Copy address" />
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-500">
                <Network className="size-4" /> Network
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span
                  className={cn("size-2 rounded-full", network?.isSupported ? "bg-emerald-500" : "bg-amber-500")}
                />
                {network?.name ?? "Unknown"}
              </span>
            </div>
            {network && !network.isSupported && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                FreeLance Chain targets the local Hardhat network (chain ID {HARDHAT_CHAIN_ID}).
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={handleSwitch}>
                  Switch to Hardhat Local
                </Button>
              </div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleDisconnect}
            className="flex w-full cursor-pointer items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            <LogOut className="size-4" /> Disconnect wallet
          </button>
        </div>
      )}
    </div>
  );
}
