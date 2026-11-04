/** Read-only access to the deployed `ServiceAgreement` through the wallet's RPC connection. */
import { Contract } from "ethers";
import serviceAgreement from "@/contracts/ServiceAgreement.json";
import { getBrowserProvider } from "@/lib/ethereum";

export function getServiceAgreementReader() {
  const provider = getBrowserProvider();
  return { provider, contract: new Contract(serviceAgreement.address, serviceAgreement.abi, provider) };
}
