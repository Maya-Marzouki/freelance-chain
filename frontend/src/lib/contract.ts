/**
 * Backwards-compatible entry point. All Ethereum helpers now live in
 * `@/lib/ethereum`.
 */
import { getServiceAgreementContract, requestAccounts } from "@/lib/ethereum";

export { AGREEMENT_STATUSES as STATUS_LABELS } from "@/types/agreement";

export async function connectWallet() {
  const address = await requestAccounts();
  return { address };
}

export async function getServiceAgreement() {
  const { address } = await connectWallet();
  const contract = await getServiceAgreementContract();
  return { contract, address };
}
