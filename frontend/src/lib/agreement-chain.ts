/**
 * Reads and writes `ServiceAgreement` (contract A) on the blockchain.
 *
 * Every function receives the ethers `Contract` (connected to a provider for
 * reads, to a signer for writes) so the module has no dependency on the wallet.
 */
import { formatEther, parseEther, type Contract, type Provider } from "ethers";
import { loadMeta, type AgreementMeta } from "@/lib/agreement-meta";
import { hashTerms } from "@/lib/ethereum";
import {
  AGREEMENT_STATUSES,
  type ActivityType,
  type Agreement,
  type AgreementAction,
  type AgreementEvent,
  type AgreementStatus,
  type CreateAgreementInput,
  type Party,
} from "@/types/agreement";

/** Activity recorded when an agreement reaches a status (Created has its own event). */
const STATUS_EVENT: Record<AgreementStatus, ActivityType> = {
  Created: "AgreementCreated",
  Accepted: "AgreementAccepted",
  InProgress: "WorkStarted",
  Delivered: "DeliverySubmitted",
  Completed: "AgreementCompleted",
  Cancelled: "AgreementCancelled",
  Disputed: "DisputeRaised",
};

const statusOf = (value: bigint | number): AgreementStatus => AGREEMENT_STATUSES[Number(value)] ?? "Created";

const party = (address: string, name: string): Party => ({ name, address });

/** Smart-contract custom errors, translated for the user. */
const ERROR_MESSAGES: Record<string, string> = {
  NotClient: "Only the client of this agreement can do this.",
  NotFreelancer: "Only the freelancer of this agreement can do this.",
  NotParty: "Only the client or the freelancer can do this.",
  NotArbiter: "Only the arbiter can do this.",
  InvalidStatus: "This action is not allowed in the agreement's current status.",
  DeadlineNotPassed: "The deadline has not passed yet.",
  AgreementNotFound: "This agreement does not exist on the connected blockchain.",
  InvalidParameters: "Invalid parameters: check the freelancer address and the deadline.",
};

export function chainErrorMessage(err: unknown, contract?: Contract): string {
  const e = err as {
    code?: string | number;
    revert?: { name?: string };
    data?: string;
    info?: { error?: { data?: string } };
    shortMessage?: string;
    message?: string;
  };
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return "Transaction rejected in MetaMask.";
  if (e?.code === "BAD_DATA") {
    return "No ServiceAgreement contract at the saved address on this network. Restart the Hardhat node, then run npm run deploy:local.";
  }

  let name = e?.revert?.name;
  const raw = e?.data ?? e?.info?.error?.data;
  if (!name && raw && contract) {
    try {
      name = contract.interface.parseError(raw)?.name;
    } catch {
      /* not a contract error */
    }
  }
  if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name];
  return e?.shortMessage ?? e?.message ?? "Unexpected blockchain error.";
}

/* ---------------------------------- Reads ---------------------------------- */

export async function readArbiter(contract: Contract): Promise<string> {
  return (await contract.arbiter()) as string;
}

/** Loads every agreement with its off-chain details and its event history. */
export async function readAgreements(contract: Contract, provider: Provider): Promise<Agreement[]> {
  const count = Number(await contract.agreementCount());
  if (count === 0) return [];

  const [created, changed, structs] = await Promise.all([
    contract.queryFilter(contract.filters.AgreementCreated()),
    contract.queryFilter(contract.filters.StatusChanged()),
    Promise.all(Array.from({ length: count }, (_, i) => contract.getAgreement(i + 1))),
  ]);

  const blockTimes = new Map<number, string>();
  const dateOf = async (blockNumber: number) => {
    if (!blockTimes.has(blockNumber)) {
      const block = await provider.getBlock(blockNumber);
      blockTimes.set(blockNumber, new Date(Number(block?.timestamp ?? 0) * 1000).toISOString());
    }
    return blockTimes.get(blockNumber)!;
  };

  const eventsByAgreement = new Map<number, AgreementEvent[]>();
  const push = (id: number, event: AgreementEvent) => eventsByAgreement.set(id, [...(eventsByAgreement.get(id) ?? []), event]);

  for (const log of created) {
    const id = Number((log as unknown as { args: { id: bigint } }).args.id);
    push(id, {
      id: `${id}-AgreementCreated`,
      type: "AgreementCreated",
      date: await dateOf(log.blockNumber),
      actor: (log as unknown as { args: { client: string } }).args.client,
      txHash: log.transactionHash,
    });
  }

  const ordered = [...changed].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  for (const log of ordered) {
    const args = (log as unknown as { args: { id: bigint; newStatus: bigint } }).args;
    const id = Number(args.id);
    const tx = await log.getTransaction();
    push(id, {
      id: `${id}-${log.transactionHash}-${log.index}`,
      type: STATUS_EVENT[statusOf(args.newStatus)],
      date: await dateOf(log.blockNumber),
      actor: tx.from,
      txHash: log.transactionHash,
    });
  }

  const creationTx = new Map(created.map((l) => [Number((l as unknown as { args: { id: bigint } }).args.id), l.transactionHash]));

  return structs
    .map((a): Agreement => {
      const id = Number(a.id);
      const events = eventsByAgreement.get(id) ?? [];
      const meta: AgreementMeta | undefined = loadMeta(a.termsHash);
      return {
        id: `AGR-${id}`,
        onChainId: id,
        title: a.title,
        description: meta?.description ?? "The description is stored off-chain and is not available in this browser.",
        terms:
          meta?.terms ??
          "The terms text is stored off-chain and is not available in this browser. Only its hash is recorded on-chain.",
        client: party(a.client, "Client"),
        freelancer: party(a.freelancer, "Freelancer"),
        amountEth: Number(formatEther(a.amount)),
        createdAt: events[0]?.date ?? new Date(0).toISOString(),
        deadline: new Date(Number(a.deadline) * 1000).toISOString(),
        status: statusOf(a.status),
        txHash: creationTx.get(id) ?? "",
        termsHash: a.termsHash,
        documentName: meta?.documentName,
        timeline: events,
      };
    })
    .sort((a, b) => b.onChainId - a.onChainId);
}

/* ---------------------------------- Writes --------------------------------- */

/** Creates an agreement. The connected wallet becomes the client (`msg.sender`). */
export async function createOnChain(
  contract: Contract,
  input: CreateAgreementInput,
): Promise<{ txHash: string; onChainId: number; termsHash: string }> {
  const termsHash = hashTerms(input.terms);
  const deadline = Math.floor(new Date(`${input.deadline}T23:59:59.000Z`).getTime() / 1000);
  const tx = await contract.createAgreement(
    input.freelancerAddress,
    input.title,
    termsHash,
    parseEther(input.amountEth.toFixed(18)),
    deadline,
  );
  const receipt = await tx.wait();

  let onChainId = 0;
  for (const log of receipt?.logs ?? []) {
    const parsed = contract.interface.parseLog(log);
    if (parsed?.name === "AgreementCreated") onChainId = Number(parsed.args.id);
  }
  return { txHash: tx.hash as string, onChainId, termsHash };
}

/** Sends the contract transaction matching a lifecycle action. Resolves with its hash. */
export async function sendAction(contract: Contract, action: AgreementAction, onChainId: number): Promise<string> {
  let tx;
  switch (action) {
    case "accept":
      tx = await contract.acceptAgreement(onChainId);
      break;
    case "start":
      tx = await contract.startWork(onChainId);
      break;
    case "deliver":
      tx = await contract.markDelivered(onChainId);
      break;
    case "approve":
      tx = await contract.approveDelivery(onChainId);
      break;
    case "cancel":
      tx = await contract.cancel(onChainId);
      break;
    case "cancelOverdue":
      tx = await contract.cancelOverdue(onChainId);
      break;
    case "dispute":
      tx = await contract.raiseDispute(onChainId);
      break;
    case "resolveForFreelancer":
      tx = await contract.resolveDispute(onChainId, true);
      break;
    case "resolveForClient":
      tx = await contract.resolveDispute(onChainId, false);
      break;
  }
  await tx.wait();
  return tx.hash as string;
}
