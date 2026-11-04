"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  describeNetwork,
  getAuthorizedAccounts,
  getChainId,
  getInjectedProvider,
  requestAccounts,
  revokePermissions,
  switchToHardhat,
  walletErrorMessage,
} from "@/lib/ethereum";
import type { WalletState } from "@/types/wallet";

interface WalletContextValue extends WalletState {
  hasProvider: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/** Set when the user explicitly disconnects, so we don't silently reconnect. */
const DISCONNECTED_KEY = "flc:wallet-disconnected";

function readFlag(): boolean {
  try {
    return localStorage.getItem(DISCONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}
function writeFlag(value: boolean) {
  try {
    if (value) localStorage.setItem(DISCONNECTED_KEY, "1");
    else localStorage.removeItem(DISCONNECTED_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    status: "initializing",
    address: null,
    network: null,
    error: null,
  });
  const [hasProvider, setHasProvider] = useState(false);

  // Initial silent detection + event subscriptions.
  useEffect(() => {
    const injected = getInjectedProvider();
    if (!injected) {
      setState((s) => ({ ...s, status: "unavailable" }));
      return;
    }
    setHasProvider(true);

    let cancelled = false;
    (async () => {
      try {
        const chainId = await getChainId();
        const accounts = readFlag() ? [] : await getAuthorizedAccounts();
        if (cancelled) return;
        setState({
          status: accounts.length ? "connected" : "disconnected",
          address: accounts[0] ?? null,
          network: describeNetwork(chainId),
          error: null,
        });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, status: "disconnected", error: walletErrorMessage(err) }));
      }
    })();

    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) ?? [];
      setState((s) => ({
        ...s,
        address: accounts[0] ?? null,
        status: accounts.length && !readFlag() ? "connected" : "disconnected",
      }));
    };
    const onChain = (...args: unknown[]) => {
      const chainId = Number.parseInt(String(args[0]), 16);
      setState((s) => ({ ...s, network: describeNetwork(chainId) }));
    };
    injected.on?.("accountsChanged", onAccounts);
    injected.on?.("chainChanged", onChain);
    return () => {
      cancelled = true;
      injected.removeListener?.("accountsChanged", onAccounts);
      injected.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    if (!getInjectedProvider()) {
      setState((s) => ({ ...s, status: "unavailable", error: "MetaMask is not installed." }));
      throw new Error("MetaMask is not installed.");
    }
    setState((s) => ({ ...s, status: "connecting", error: null }));
    try {
      const address = await requestAccounts();
      const chainId = await getChainId();
      writeFlag(false);
      setState({ status: "connected", address, network: describeNetwork(chainId), error: null });
    } catch (err) {
      const message = walletErrorMessage(err);
      setState((s) => ({ ...s, status: "disconnected", error: message }));
      throw new Error(message);
    }
  }, []);

  const disconnect = useCallback(async () => {
    writeFlag(true);
    await revokePermissions();
    setState((s) => ({ ...s, status: "disconnected", address: null, error: null }));
  }, []);

  const switchNetwork = useCallback(async () => {
    try {
      await switchToHardhat();
    } catch (err) {
      throw new Error(walletErrorMessage(err));
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, hasProvider, connect, disconnect, switchNetwork }),
    [state, hasProvider, connect, disconnect, switchNetwork],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
