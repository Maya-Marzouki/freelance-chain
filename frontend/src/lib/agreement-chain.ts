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
  type Deliverable,
  type DisputeInfo,
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

const ZERO_HASH = `0x${"0".repeat(64)}`;

const statusOf = (value: bigint | number): AgreementStatus => AGREEMENT_STATUSES[Number(value)] ?? "Created";

const party = (address: string, name: string): Party => ({ name, address });

/** Smart-contract custom errors, translated for the user. */
const ERROR_MESSAGES: Record<string, string> = {
  NotClient: "Only the client of this agreement can do this.",
  NotFreelancer: "Only the freelancer of this agreement can do this.",
  NotParty: "Only the client or the freelancer can do this.",
  DisputeWindowOpen: "The dispute window is still open. Either party can concede meanwhile.",
  InvalidStatus: "This action is not allowed in the agreement's current status.",
  DeadlineNotPassed: "The deadline has not passed yet.",
  AgreementNotFound: "This agreement does not exist on the connected blockchain.",
  EscrowNotFunded: "The client has not funded the escrow yet: work can only start once the payment is locked.",
  DeliveryExpired:
    "The work is 100 days late: the late penalty reached 100%, so it can no longer be delivered. The agreement can be cancelled and the client refunded.",
  NotExpired: "The agreement is not 100 days late yet.",
  NotDeployer: "Only the deployer can link the escrow contract.",
  InvalidParameters:
    "Invalid parameters. The freelancer must be a different account from the one signing in MetaMask, and the deadline must be after the blockchain's current date (it moves ahead with npm run time:skip). When delivering, a link is required.",
};

export function chainErrorMessage(err: unknown, contract?: Contract): string {
  const e = err as {
    code?: string | number;
    revert?: { name?: string };
    data?: string;
    info?: { error?: { data?: string; message?: string } };
    shortMessage?: string;
    message?: string;
  };
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return "Transaction rejected in MetaMask.";
  // Local dev: MetaMask remembers transactions of a previous node, so its counter is ahead of the new node's.
  if (/nonce too (high|low)/i.test(`${e?.message ?? ""} ${e?.info?.error?.message ?? ""}`)) {
    return "MetaMask's transaction counter is out of sync with the local node. In MetaMask: Settings > Developer tools > Clear activity and nonce data (for this account), then try again.";
  }
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

/** Timestamp (ms) of the latest block: the clock the contract uses for deadlines and dispute windows. */
export async function readChainTime(provider: Provider): Promise<number> {
  const block = await provider.getBlock("latest");
  return Number(block?.timestamp ?? 0) * 1000;
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

  // Dispute context (who opened it, when the window ends, what the automatic rule gives).
  const disputes = new Map<number, DisputeInfo>();
  await Promise.all(
    structs
      .filter((a) => statusOf(a.status) === "Disputed")
      .map(async (a) => {
        const d = await contract.getDispute(a.id);
        disputes.set(Number(a.id), {
          raisedBy: d.raisedBy,
          openedFrom: statusOf(d.openedFrom) === "Delivered" ? "Delivered" : "InProgress",
          openedAt: new Date(Number(d.openedAt) * 1000).toISOString(),
          windowEndsAt: new Date(Number(d.windowEndsAt) * 1000).toISOString(),
          freelancerWinsByDefault: d.freelancerWinsByDefault as boolean,
        });
      }),
  );

  // Deliverable (hash + link) of every agreement that reached Delivered.
  const deliverables = new Map<number, Deliverable>();
  const deliveredAt = new Map<number, string>();
  await Promise.all(
    structs.map(async (a) => {
      const [d, at] = await Promise.all([contract.deliverables(a.id), contract.deliveredAt(a.id) as Promise<bigint>]);
      if (d.hash !== ZERO_HASH) deliverables.set(Number(a.id), { hash: d.hash, uri: d.uri });
      if (at > BigInt(0)) deliveredAt.set(Number(a.id), new Date(Number(at) * 1000).toISOString());
    }),
  );

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
        dispute: disputes.get(id),
        deliverable: deliverables.get(id),
        deliveredAt: deliveredAt.get(id),
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
export async function sendAction(
  contract: Contract,
  action: AgreementAction,
  onChainId: number,
  deliverable?: Deliverable,
): Promise<string> {
  let tx;
  switch (action) {
    case "accept":
      tx = await contract.acceptAgreement(onChainId);
      break;
    case "start":
      tx = await contract.startWork(onChainId);
      break;
    case "deliver":
      if (!deliverable) throw new Error("Add a link to your deliverable before submitting.");
      tx = await contract.markDelivered(onChainId, deliverable.hash, deliverable.uri);
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
    case "cancelExpired":
      tx = await contract.cancelExpired(onChainId);
      break;
    case "dispute":
      tx = await contract.raiseDispute(onChainId);
      break;
    case "concedeAsClient":
    case "concedeAsFreelancer":
      tx = await contract.concede(onChainId); // the contract decides the outcome from the caller
      break;
    case "resolveDispute":
      tx = await contract.resolveDispute(onChainId);
      break;
  }
  await tx.wait();
  return tx.hash as string;
}
