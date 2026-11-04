/**
 * Ethereum access layer (ethers.js v6).
 *
 * The UI only talks to the blockchain through this module, so swapping mock
 * interactions for real contract calls is a matter of implementing the
 * functions at the bottom of the file once the contracts are deployed.
 */
import { BrowserProvider, Contract, id as keccakId, parseEther, type Signer } from "ethers";
import serviceAgreement from "@/contracts/ServiceAgreement.json";
import { AGREEMENT_STATUSES, type AgreementStatus, type CreateAgreementInput } from "@/types/agreement";
import type { InjectedProvider, NetworkInfo } from "@/types/wallet";

/* --------------------------------- Networks -------------------------------- */

export const HARDHAT_CHAIN_ID = 31337;

export const HARDHAT_NETWORK = {
  chainId: `0x${HARDHAT_CHAIN_ID.toString(16)}`, // 0x7a69
  chainName: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["http://127.0.0.1:8545"],
} as const;

const KNOWN_NETWORKS: Record<number, string> = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia",
  17000: "Holesky",
  137: "Polygon",
  [HARDHAT_CHAIN_ID]: "Hardhat Local",
};

/** Chains the dApp is configured to work with. */
export const SUPPORTED_CHAIN_IDS = [HARDHAT_CHAIN_ID];

export function describeNetwork(chainId: number): NetworkInfo {
  return {
    chainId,
    name: KNOWN_NETWORKS[chainId] ?? `Chain ${chainId}`,
    isSupported: SUPPORTED_CHAIN_IDS.includes(chainId),
  };
}

/* --------------------------------- Provider -------------------------------- */

export function getInjectedProvider(): InjectedProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function isMetaMaskInstalled(): boolean {
  return !!getInjectedProvider()?.isMetaMask;
}

export function getBrowserProvider(): BrowserProvider {
  const injected = getInjectedProvider();
  if (!injected) throw new Error("MetaMask is not installed.");
  return new BrowserProvider(injected);
}

/** Prompt MetaMask for account access. Returns the first account. */
export async function requestAccounts(): Promise<string> {
  const injected = getInjectedProvider();
  if (!injected) throw new Error("MetaMask is not installed.");
  const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) throw new Error("No account was returned by MetaMask.");
  return accounts[0];
}

/** Read already-authorised accounts without prompting. */
export async function getAuthorizedAccounts(): Promise<string[]> {
  const injected = getInjectedProvider();
  if (!injected) return [];
  return ((await injected.request({ method: "eth_accounts" })) as string[]) ?? [];
}

export async function getChainId(): Promise<number> {
  const injected = getInjectedProvider();
  if (!injected) throw new Error("MetaMask is not installed.");
  const hex = (await injected.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(hex, 16);
}

/** Switch to Hardhat (31337), adding the network to MetaMask if needed. */
export async function switchToHardhat(): Promise<void> {
  const injected = getInjectedProvider();
  if (!injected) throw new Error("MetaMask is not installed.");
  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HARDHAT_NETWORK.chainId }],
    });
  } catch (err) {
    if ((err as { code?: number })?.code === 4902) {
      await injected.request({ method: "wallet_addEthereumChain", params: [HARDHAT_NETWORK] });
    } else {
      throw err;
    }
  }
}

/** Best-effort permission revocation (supported by recent MetaMask versions). */
export async function revokePermissions(): Promise<void> {
  const injected = getInjectedProvider();
  if (!injected) return;
  try {
    await injected.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    // Older wallets do not support revocation; the UI state is still reset.
  }
}

export function walletErrorMessage(err: unknown): string {
  const e = err as { code?: number; message?: string };
  if (e?.code === 4001) return "Request rejected in MetaMask.";
  if (e?.code === -32002) return "A MetaMask request is already pending. Open MetaMask to continue.";
  return e?.message ?? "Unexpected wallet error.";
}

/* --------------------------------- Contract -------------------------------- */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** True once a real ServiceAgreement address has been written to the ABI file. */
export const isContractDeployed = serviceAgreement.address !== ZERO_ADDRESS;

export function statusFromChain(value: bigint | number): AgreementStatus {
  return AGREEMENT_STATUSES[Number(value)] ?? "Created";
}

export async function getSigner(): Promise<Signer> {
  return getBrowserProvider().getSigner();
}

export async function getServiceAgreementContract(signer?: Signer): Promise<Contract> {
  if (!isContractDeployed) throw new Error("ServiceAgreement contract is not deployed yet.");
  return new Contract(serviceAgreement.address, serviceAgreement.abi, signer ?? (await getSigner()));
}

/** keccak256 of the terms text, stored on-chain as `bytes32 termsHash`. */
export function hashTerms(terms: string): string {
  return keccakId(terms);
}

/**
 * Prepared on-chain call for agreement creation. Not used while the app runs
 * in demo mode; kept here so the form can switch to it without UI changes.
 */
export async function createAgreementOnChain(input: CreateAgreementInput): Promise<{ txHash: string }> {
  const contract = await getServiceAgreementContract();
  const deadline = Math.floor(new Date(input.deadline).getTime() / 1000);
  const tx = await contract.createAgreement(
    input.freelancerAddress,
    input.title,
    hashTerms(input.terms),
    parseEther(String(input.amountEth)),
    deadline,
  );
  await tx.wait();
  return { txHash: tx.hash as string };
}

export async function acceptAgreementOnChain(onChainId: number): Promise<{ txHash: string }> {
  const contract = await getServiceAgreementContract();
  const tx = await contract.acceptAgreement(onChainId);
  await tx.wait();
  return { txHash: tx.hash as string };
}
