import type { Eip1193Provider } from "ethers";

/** EIP-1193 provider with the event API exposed by MetaMask. */
export interface InjectedProvider extends Eip1193Provider {
  isMetaMask?: boolean;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

export type WalletStatus =
  | "initializing"
  | "unavailable" // MetaMask not installed
  | "disconnected"
  | "connecting"
  | "connected";

export interface NetworkInfo {
  chainId: number;
  name: string;
  isSupported: boolean;
}

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  network: NetworkInfo | null;
  error: string | null;
}
