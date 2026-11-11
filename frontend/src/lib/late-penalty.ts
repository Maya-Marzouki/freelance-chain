/**
 * Late-delivery penalty, mirroring `ServiceAgreement.latePenaltyPercent` and
 * `EscrowMilestones.settle`: 1 % of the amount per started day of delay after
 * the deadline, capped at 100 %. At 100 % the agreement can no longer be
 * delivered and anyone can cancel it (`cancelExpired`): the client is refunded.
 */
import type { Agreement } from "@/types/agreement";

export const LATE_PENALTY_PER_DAY = 1;
export const MAX_PENALTY = 100;
const DAY_S = 24 * 3600;

/** Started days of delay at `atMs` (0 when on time). */
export function daysLate(deadline: string, atMs: number): number {
  const late = Math.floor(atMs / 1000) - Math.floor(new Date(deadline).getTime() / 1000);
  return late <= 0 ? 0 : Math.ceil(late / DAY_S);
}

/** Penalty (%) a delivery made at `atMs` would get. */
export function penaltyAt(deadline: string, atMs: number): number {
  return Math.min(daysLate(deadline, atMs) * LATE_PENALTY_PER_DAY, MAX_PENALTY);
}

/** Penalty (%) recorded for the agreement: fixed by the delivery date, 0 if nothing was delivered. */
export function latePenaltyPercent(agreement: Pick<Agreement, "deadline" | "deliveredAt">): number {
  return agreement.deliveredAt ? penaltyAt(agreement.deadline, new Date(agreement.deliveredAt).getTime()) : 0;
}

/**
 * How the escrow is split when the agreement completes: the freelancer is entitled to the
 * amount minus the penalty, milestones already released count towards it, the rest goes back
 * to the client.
 */
export function settlementSplit(depositedEth: number, releasedEth: number, penalty: number) {
  const remaining = Math.max(depositedEth - releasedEth, 0);
  const due = (depositedEth * (100 - penalty)) / 100;
  const toFreelancer = Math.min(Math.max(due - releasedEth, 0), remaining);
  return { toFreelancer, toClient: remaining - toFreelancer };
}
