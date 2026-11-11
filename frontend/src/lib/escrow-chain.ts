/**
 * Reads and writes `EscrowMilestones` (contract B).
 *
 * The escrow is linked to a `ServiceAgreement` by `agreementId`. The contract reads the
 * agreement: parties, total and status come from it, and there is no arbiter. Milestones
 * freeze while the agreement is disputed, and `settle` follows its final status.
 */
import { formatEther, parseEther, type Contract, type Provider } from "ethers";
import { chainErrorMessage } from "@/lib/agreement-chain";
import {
  ESCROW_STATUSES,
  type ActivityItem,
  type Agreement,
  type Escrow,
  type EscrowMilestoneInput,
  type EscrowStatus,
  type Milestone,
  type MilestoneStatus,
} from "@/types/agreement";

const MILESTONE_STATUSES: MilestoneStatus[] = ["Pending", "Submitted", "Approved", "Released"];

const escrowStatusOf = (v: bigint | number): EscrowStatus => ESCROW_STATUSES[Number(v)] ?? "Created";
const milestoneStatusOf = (v: bigint | number): MilestoneStatus => MILESTONE_STATUSES[Number(v)] ?? "Pending";
const toIso = (seconds: bigint | number) => new Date(Number(seconds) * 1000).toISOString();

/** Revert reasons of the escrow contract, translated for the user. */
const REASONS: Record<string, string> = {
  "Only client": "Only the client of this escrow can do this.",
  "Only freelancer": "Only the freelancer of this escrow can do this.",
  "Escrow does not exist": "This escrow does not exist.",
  "Agreement not open": "The agreement is no longer open: an escrow can only be set up before delivery.",
  "Escrow already exists": "This agreement already has an escrow.",
  "Invalid milestones": "The milestones are incomplete.",
  "Invalid amount": "Every milestone needs an amount greater than zero.",
  "Invalid deadline": "Every milestone deadline must be in the future.",
  "Total must match agreement": "The milestones must add up to the agreement amount.",
  "Invalid escrow status": "This action is not allowed in the escrow's current status.",
  "Incorrect deposit amount": "The deposit must match the escrow total exactly.",
  "Agreement not accepted": "The freelancer must accept the agreement before the escrow is funded.",
  "Invalid milestone": "This milestone does not exist.",
  "Milestone already submitted": "This milestone was already submitted.",
  "Deliverable required": "Add a link to the milestone deliverable before submitting.",
  "Deadline passed": "The milestone deadline has passed.",
  "Milestone not submitted": "The freelancer has not submitted this milestone yet.",
  "Escrow unavailable": "The escrow is not active.",
  "Agreement frozen": "The agreement is disputed or cancelled: milestones are frozen.",
  "Milestone not approved": "This milestone must be approved before payment.",
  "Already settled": "This escrow was already settled.",
  "Agreement not finished": "The agreement is not finished yet: settle once it is Completed or Cancelled.",
};

export function escrowErrorMessage(err: unknown, contract?: Contract): string {
  const e = err as { reason?: string | null; revert?: { args?: unknown[] } };
  const reason = e?.reason ?? (typeof e?.revert?.args?.[0] === "string" ? (e.revert.args[0] as string) : undefined);
  if (reason && REASONS[reason]) return REASONS[reason];
  return chainErrorMessage(err, contract);
}

/* ---------------------------------- Reads ---------------------------------- */

export interface EscrowSnapshot {
  escrows: Escrow[];
  milestones: Milestone[];
  /** Milestone submissions and payments, for the activity feed. */
  activity: ActivityItem[];
}

export async function readEscrows(
  contract: Contract,
  provider: Provider,
  agreements: Agreement[],
): Promise<EscrowSnapshot> {
  const created = await contract.queryFilter(contract.filters.EscrowCreated());
  const ids = created.map((l) => Number((l as unknown as { args: { escrowId: bigint } }).args.escrowId));
  if (ids.length === 0) return { escrows: [], milestones: [], activity: [] };

  const escrows: Escrow[] = [];
  const milestones: Milestone[] = [];

  await Promise.all(
    ids.map(async (id) => {
      const e = await contract.getEscrow(id);
      const agreementId = `AGR-${Number(e.agreementId)}`;
      escrows.push({
        id: `ESC-${id}`,
        escrowId: id,
        agreementId,
        client: e.client,
        freelancer: e.freelancer,
        totalEth: Number(formatEther(e.totalAmount)),
        depositedEth: Number(formatEther(e.depositedAmount)),
        releasedEth: Number(formatEther(e.releasedAmount)),
        status: escrowStatusOf(e.status),
        milestoneCount: Number(e.milestoneCount),
      });
      const list = await Promise.all(Array.from({ length: Number(e.milestoneCount) }, (_, i) => contract.getMilestone(id, i)));
      list.forEach((m, i) =>
        milestones.push({
          id: `MS-${id}-${i + 1}`,
          agreementId,
          title: m.title,
          description: m.description,
          amountEth: Number(formatEther(m.amount)),
          dueDate: toIso(m.deadline),
          status: milestoneStatusOf(m.status),
          escrowId: id,
          index: i,
          deliverableUri: m.deliverableUri || undefined,
        }),
      );
    }),
  );
  escrows.sort((a, b) => b.escrowId - a.escrowId);
  milestones.sort((a, b) => (a.escrowId ?? 0) - (b.escrowId ?? 0) || (a.index ?? 0) - (b.index ?? 0));

  // Activity feed: milestone submissions and released payments.
  const titleOf = new Map(agreements.map((a) => [a.id, a.title]));
  const agreementOf = new Map(escrows.map((e) => [e.escrowId, e.agreementId]));
  const blockTimes = new Map<number, string>();
  const dateOf = async (n: number) => {
    if (!blockTimes.has(n)) blockTimes.set(n, toIso((await provider.getBlock(n))?.timestamp ?? 0));
    return blockTimes.get(n)!;
  };
  const [submitted, released] = await Promise.all([
    contract.queryFilter(contract.filters.MilestoneSubmitted()),
    contract.queryFilter(contract.filters.PaymentReleased()),
  ]);
  const activity: ActivityItem[] = [];
  const logs = [...submitted.map((log) => ({ log, isPayment: false })), ...released.map((log) => ({ log, isPayment: true }))];
  for (const { log, isPayment } of logs) {
    const args = (log as unknown as { args: { escrowId: bigint; milestoneId: bigint; freelancer?: string; amount?: bigint } }).args;
    const agreementId = agreementOf.get(Number(args.escrowId));
    if (!agreementId) continue;
    const tx = await log.getTransaction();
    const milestone = milestones.find((m) => m.escrowId === Number(args.escrowId) && m.index === Number(args.milestoneId));
    activity.push({
      id: `${log.transactionHash}-${log.index}`,
      type: isPayment ? "PaymentReleased" : "MilestoneSubmitted",
      date: await dateOf(log.blockNumber),
      actor: tx.from,
      txHash: log.transactionHash,
      agreementId,
      agreementTitle: titleOf.get(agreementId) ?? agreementId,
      amountEth: isPayment ? Number(formatEther(args.amount!)) : undefined,
      note: milestone?.title,
    });
  }
  return { escrows, milestones, activity };
}

/* ---------------------------------- Writes --------------------------------- */

/**
 * Creates the escrow of an agreement. The parties and the total come from the agreement
 * itself, and the connected wallet must be its client.
 */
export async function createEscrowOnChain(
  contract: Contract,
  agreement: Agreement,
  milestones: EscrowMilestoneInput[],
): Promise<{ txHash: string; escrowId: number }> {
  const tx = await contract.createEscrow(
    agreement.onChainId,
    milestones.map((m) => parseEther(m.amountEth.toFixed(18))),
    milestones.map((m) => m.title),
    milestones.map((m) => m.description),
    milestones.map((m) => Math.floor(new Date(`${m.dueDate}T23:59:59.000Z`).getTime() / 1000)),
  );
  const receipt = await tx.wait();
  let escrowId = 0;
  for (const log of receipt?.logs ?? []) {
    const parsed = contract.interface.parseLog(log);
    if (parsed?.name === "EscrowCreated") escrowId = Number(parsed.args.escrowId);
  }
  return { txHash: tx.hash as string, escrowId };
}

/** Deposits the exact escrow total. */
export async function fundEscrowOnChain(contract: Contract, escrowId: number): Promise<string> {
  const escrow = await contract.getEscrow(escrowId);
  const tx = await contract.deposit(escrowId, { value: escrow.totalAmount });
  await tx.wait();
  return tx.hash as string;
}

/** Submits a milestone with the link to its deliverable (required by the contract). */
export async function submitMilestoneOnChain(
  contract: Contract,
  escrowId: number,
  index: number,
  deliverableUri: string,
): Promise<string> {
  const tx = await contract.submitMilestone(escrowId, index, deliverableUri);
  await tx.wait();
  return tx.hash as string;
}

/**
 * Approves (if still needed) then releases the payment: two transactions.
 * If the second one is rejected, the milestone stays "Approved" and can be released later.
 */
export async function releaseMilestoneOnChain(
  contract: Contract,
  escrowId: number,
  index: number,
  status: MilestoneStatus,
): Promise<string> {
  if (status === "Submitted") {
    const approval = await contract.approveMilestone(escrowId, index);
    await approval.wait();
  }
  const tx = await contract.releasePayment(escrowId, index);
  await tx.wait();
  return tx.hash as string;
}

/**
 * Settles the escrow by the outcome of the agreement: Completed pays the freelancer the
 * remaining funds, Cancelled refunds the client. Anyone can call it once the agreement is finished.
 */
export async function settleEscrowOnChain(contract: Contract, escrowId: number): Promise<string> {
  const tx = await contract.settle(escrowId);
  await tx.wait();
  return tx.hash as string;
}
