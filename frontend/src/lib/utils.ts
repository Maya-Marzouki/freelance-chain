/** Concatenate class names, dropping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** 0x1234…abcd */
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function shortenHash(hash: string): string {
  return shortenAddress(hash, 6);
}

export function formatEth(value: number, maxDecimals = 3): string {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  })} ETH`;
}

/** Mock ETH/USD rate used only for display purposes. */
export const MOCK_ETH_USD = 3120;

export function formatUsd(eth: number): string {
  return (eth * MOCK_ETH_USD).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
export function isValidAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Generate a random 32-byte hex string used as a *simulated* transaction
 * hash. It is never sent to or derived from a blockchain.
 */
export function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return `0x${Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Days between two ISO dates (b - a), rounded. */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}
