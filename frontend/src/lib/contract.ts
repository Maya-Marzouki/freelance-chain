import { BrowserProvider, Contract, type Eip1193Provider } from "ethers";
import serviceAgreement from "@/contracts/ServiceAgreement.json";

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/** Statuts du contrat, dans le meme ordre que l'enum Solidity `Status`. */
export const STATUS_LABELS = [
  "Created",
  "Accepted",
  "InProgress",
  "Delivered",
  "Completed",
  "Cancelled",
  "Disputed",
] as const;

export async function connectWallet() {
  if (!window.ethereum) throw new Error("MetaMask n'est pas installe");
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export async function getServiceAgreement() {
  const { signer, address } = await connectWallet();
  const contract = new Contract(serviceAgreement.address, serviceAgreement.abi, signer);
  return { contract, address };
}
