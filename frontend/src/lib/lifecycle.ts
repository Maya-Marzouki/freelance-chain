/**
 * Agreement lifecycle rules. This is the single source of truth for which
 * action a given role may perform in a given status. It mirrors the checks the
 * Solidity contract is expected to enforce (`InvalidStatus`, `NotFreelancer`…),
 * so the UI never offers an action the contract would reject.
 */
import type {
  ActivityType,
  AgreementAction,
  AgreementStatus,
  EscrowStatus,
  Milestone,
  MilestoneStatus,
  Role,
} from "@/types/agreement";

export interface ActionDefinition {
  action: AgreementAction;
  label: string;
  description: string;
  allowedRoles: Role[];
  from: AgreementStatus[];
  to: AgreementStatus;
  event: ActivityType;
  /**
   * Extra condition enforced by the contract besides role and status:
   * `deadlinePassed` (cancelOverdue) or `arbiter` (resolve functions).
   */
  requires?: "deadlinePassed" | "arbiter";
  tone: "primary" | "danger" | "neutral";
  confirmTitle: string;
  confirmBody: string;
}

export const ACTIONS: Record<AgreementAction, ActionDefinition> = {
  accept: {
    action: "accept",
    label: "Accept Agreement",
    description: "Agree to the terms and lock the scope.",
    allowedRoles: ["freelancer"],
    from: ["Created"],
    to: "Accepted",
    event: "AgreementAccepted",
    tone: "primary",
    confirmTitle: "Accept this agreement?",
    confirmBody: "You commit to deliver the described work by the deadline. The client's funds will be locked in escrow.",
  },
  start: {
    action: "start",
    label: "Start Work",
    description: "Signal that work has begun.",
    allowedRoles: ["freelancer"],
    from: ["Accepted"],
    to: "InProgress",
    event: "WorkStarted",
    tone: "primary",
    confirmTitle: "Start working on this agreement?",
    confirmBody: "The agreement will move to In Progress and the client will be notified.",
  },
  deliver: {
    action: "deliver",
    label: "Mark as Delivered",
    description: "Submit the final delivery for review.",
    allowedRoles: ["freelancer"],
    from: ["InProgress"],
    to: "Delivered",
    event: "DeliverySubmitted",
    tone: "primary",
    confirmTitle: "Submit your delivery?",
    confirmBody: "The client will review the delivery and can approve it or raise a dispute.",
  },
  approve: {
    action: "approve",
    label: "Approve Delivery",
    description: "Approve the work and release the escrow.",
    allowedRoles: ["client"],
    from: ["Delivered"],
    to: "Completed",
    event: "AgreementCompleted",
    tone: "primary",
    confirmTitle: "Approve delivery and release payment?",
    confirmBody: "Remaining escrow funds will be released to the freelancer. This action cannot be undone.",
  },
  dispute: {
    action: "dispute",
    label: "Raise Dispute",
    description: "Freeze the escrow and open a dispute.",
    allowedRoles: ["client", "freelancer"],
    from: ["InProgress", "Delivered"],
    to: "Disputed",
    event: "DisputeRaised",
    tone: "danger",
    confirmTitle: "Raise a dispute?",
    confirmBody: "Escrow funds will stay locked until the dispute is resolved by both parties or an arbitrator.",
  },
  cancel: {
    action: "cancel",
    label: "Cancel Agreement",
    description: "Cancel before work starts.",
    allowedRoles: ["client"],
    from: ["Created", "Accepted"],
    to: "Cancelled",
    event: "AgreementCancelled",
    tone: "danger",
    confirmTitle: "Cancel this agreement?",
    confirmBody: "The agreement will be permanently cancelled and any locked funds returned to the client.",
  },
  cancelOverdue: {
    action: "cancelOverdue",
    label: "Cancel (Overdue)",
    description: "Cancel because the deadline passed without delivery.",
    allowedRoles: ["client"],
    from: ["InProgress"],
    requires: "deadlinePassed",
    to: "Cancelled",
    event: "AgreementCancelled",
    tone: "danger",
    confirmTitle: "Cancel this overdue agreement?",
    confirmBody: "The deadline has passed and nothing was delivered. The agreement will be cancelled.",
  },
  resolveForFreelancer: {
    action: "resolveForFreelancer",
    label: "Rule for Freelancer",
    description: "Close the dispute in favour of the freelancer.",
    allowedRoles: ["client", "freelancer", "observer"],
    from: ["Disputed"],
    requires: "arbiter",
    to: "Completed",
    event: "AgreementCompleted",
    tone: "primary",
    confirmTitle: "Rule in favour of the freelancer?",
    confirmBody: "The agreement becomes Completed: the freelancer is entitled to payment. This decision is final.",
  },
  resolveForClient: {
    action: "resolveForClient",
    label: "Rule for Client",
    description: "Close the dispute in favour of the client.",
    allowedRoles: ["client", "freelancer", "observer"],
    from: ["Disputed"],
    requires: "arbiter",
    to: "Cancelled",
    event: "AgreementCancelled",
    tone: "danger",
    confirmTitle: "Rule in favour of the client?",
    confirmBody: "The agreement becomes Cancelled: the client is entitled to a refund. This decision is final.",
  },
};

export const ACTION_ORDER: AgreementAction[] = [
  "accept",
  "start",
  "deliver",
  "approve",
  "resolveForFreelancer",
  "dispute",
  "cancel",
  "cancelOverdue",
  "resolveForClient",
];

/** Facts about the viewer / chain that role and status alone cannot express. */
export interface ActionContext {
  /** `block.timestamp` is past the agreement deadline. */
  deadlinePassed?: boolean;
  /** The viewer is the contract's arbiter. */
  isArbiter?: boolean;
}

export function canPerform(
  action: AgreementAction,
  role: Role,
  status: AgreementStatus,
  context: ActionContext = {},
): boolean {
  const def = ACTIONS[action];
  if (def.requires === "arbiter") return !!context.isArbiter && def.from.includes(status);
  if (def.requires === "deadlinePassed" && !context.deadlinePassed) return false;
  return def.allowedRoles.includes(role) && def.from.includes(status);
}

export function availableActions(
  role: Role,
  status: AgreementStatus,
  context: ActionContext = {},
): ActionDefinition[] {
  return ACTION_ORDER.filter((a) => canPerform(a, role, status, context)).map((a) => ACTIONS[a]);
}

/** Explains why nothing is actionable, for empty action panels. */
export function waitingMessage(role: Role, status: AgreementStatus, isArbiter = false): string {
  if (role === "observer" && isArbiter && status === "Disputed") return "";
  if (role === "observer") return "You are not a party to this agreement. Actions are limited to the client and freelancer.";
  switch (status) {
    case "Created":
      return role === "client" ? "Waiting for the freelancer to accept." : "";
    case "Accepted":
      return role === "client" ? "Waiting for the freelancer to start work." : "";
    case "InProgress":
      return "";
    case "Delivered":
      return role === "freelancer" ? "Waiting for the client to approve your delivery." : "";
    case "Completed":
      return "This agreement is completed. No further actions are available.";
    case "Cancelled":
      return "This agreement was cancelled. No further actions are available.";
    case "Disputed":
      return isArbiter
        ? ""
        : "A dispute is open. Only the arbiter can resolve it: the agreement then becomes Completed or Cancelled.";
  }
}

/** Ordered happy-path steps used by progress indicators. */
export const HAPPY_PATH: AgreementStatus[] = ["Created", "Accepted", "InProgress", "Delivered", "Completed"];

/* -------------------------------- Milestones ------------------------------- */

export type MilestoneAction = "submit" | "release";

/**
 * `escrowStatus` is only known in live mode: the contract refuses to submit a
 * milestone while the escrow is not funded.
 */
export function milestoneAction(
  milestone: Milestone,
  role: Role,
  agreementStatus: AgreementStatus,
  escrowStatus?: EscrowStatus,
): MilestoneAction | null {
  const workOpen = agreementStatus === "Accepted" || agreementStatus === "InProgress" || agreementStatus === "Delivered";
  if (!workOpen) return null;
  if (escrowStatus && escrowStatus !== "Funded" && escrowStatus !== "InProgress") return null;
  if (milestone.status === "Pending" && role === "freelancer") return "submit";
  // On-chain, release takes two steps (approve then release): "Approved" is the state between them.
  if ((milestone.status === "Submitted" || milestone.status === "Approved") && role === "client") return "release";
  return null;
}

export const NEXT_MILESTONE_STATUS: Record<MilestoneAction, MilestoneStatus> = {
  submit: "Submitted",
  release: "Released",
};
