/** Access to the deployed `EscrowMilestones` contract (contract B). */
import { Contract, type Signer } from "ethers";
import escrowMilestones from "@/contracts/EscrowMilestones.json";
import { getBrowserProvider, getSigner } from "@/lib/ethereum";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** True once a real EscrowMilestones address has been written to the ABI file. */
export const isEscrowDeployed = escrowMilestones.address !== ZERO_ADDRESS;

export function getEscrowReader() {
  const provider = getBrowserProvider();
  return { provider, contract: new Contract(escrowMilestones.address, escrowMilestones.abi, provider) };
}

export async function getEscrowContract(signer?: Signer): Promise<Contract> {
  if (!isEscrowDeployed) throw new Error("EscrowMilestones contract is not deployed yet.");
  return new Contract(escrowMilestones.address, escrowMilestones.abi, signer ?? (await getSigner()));
}
