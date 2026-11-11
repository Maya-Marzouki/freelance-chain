/** Read-only access to the deployed `ServiceAgreement`. */
import { Contract, JsonRpcProvider } from "ethers";
import serviceAgreement from "@/contracts/ServiceAgreement.json";
import { HARDHAT_CHAIN_ID, HARDHAT_NETWORK } from "@/lib/ethereum";

let localProvider: JsonRpcProvider | undefined;

/**
 * Reads go straight to the local node instead of through MetaMask: MetaMask caches blocks by
 * number, so after the node restarts it can serve blocks of the previous chain (wrong dates,
 * wrong deadlines). MetaMask is only used to sign transactions.
 */
export function getLocalProvider(): JsonRpcProvider {
  localProvider ??= new JsonRpcProvider(HARDHAT_NETWORK.rpcUrls[0], HARDHAT_CHAIN_ID, {
    staticNetwork: true,
    cacheTimeout: -1,
  });
  return localProvider;
}

export function getServiceAgreementReader() {
  const provider = getLocalProvider();
  return { provider, contract: new Contract(serviceAgreement.address, serviceAgreement.abi, provider) };
}
