/**
 * Agreement lifecycle rules. This is the single source of truth for which
 * action a given role may perform in a given status. It mirrors the checks the
 * Solidity contract is expected to enforce (`InvalidStatus`, `NotFreelancer`…),
 * so the UI never offers an action the contract would reject.
 */
import type {
  ActivityType,
  AgreementAction,
  Agreement,
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
   * `deadlinePassed` (cancelOverdue) or `disputeWindowElapsed` (automatic ruling).
   */
  requires?: "deadlinePassed" | "disputeWindowElapsed";
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
    description: "Freeze the milestones and open a dispute.",
    allowedRoles: ["client", "freelancer"],
    from: ["InProgress", "Delivered"],
    to: "Disputed",
    event: "DisputeRaised",
    tone: "danger",
    confirmTitle: "Raise a dispute?",
    confirmBody:
      "Milestones freeze. The dispute ends when a party concedes or, after the dispute window, by the contract's automatic rule: the freelancer wins only if the work was delivered on time.",
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
  concedeAsClient: {
    action: "concedeAsClient",
    label: "Concede (pay freelancer)",
    description: "Admit the dispute is unfounded: the freelancer is paid.",
    allowedRoles: ["client"],
    from: ["Disputed"],
    to: "Completed",
    event: "AgreementCompleted",
    tone: "danger",
    confirmTitle: "Concede the dispute?",
    confirmBody:
      "You admit the freelancer is right. The agreement becomes Completed and the freelancer is entitled to the remaining payment. This is final.",
  },
  concedeAsFreelancer: {
    action: "concedeAsFreelancer",
    label: "Concede (refund client)",
    description: "Admit the dispute is founded: the client is refunded.",
    allowedRoles: ["freelancer"],
    from: ["Disputed"],
    to: "Cancelled",
    event: "AgreementCancelled",
    tone: "danger",
    confirmTitle: "Concede the dispute?",
    confirmBody:
      "You admit the client is right. The agreement becomes Cancelled and the client is entitled to a refund. This is final.",
  },
  resolveDispute: {
    action: "resolveDispute",
    label: "Apply automatic ruling",
    description: "Close the dispute with the contract's automatic rule.",
    allowedRoles: ["client", "freelancer", "observer"],
    from: ["Disputed"],
    requires: "disputeWindowElapsed",
    to: "Completed", // placeholder: see `actionTarget`, the real outcome depends on the dispute
    event: "AgreementCompleted",
    tone: "primary",
    confirmTitle: "Apply the automatic ruling?",
    confirmBody:
      "The contract closes the dispute by its rule: the freelancer wins only if the work was delivered on time, otherwise the client is refunded. Anyone can trigger it.",
  },
};

export const ACTION_ORDER: AgreementAction[] = [
  "accept",
  "start",
  "deliver",
  "approve",
  "dispute",
  "cancel",
  "cancelOverdue",
  "concedeAsClient",
  "concedeAsFreelancer",
  "resolveDispute",
];

/** Outcome of the automatic ruling, as the contract computes it. */
export function defaultRuling(agreement: Pick<Agreement, "dispute">): "Completed" | "Cancelled" {
  return agreement.dispute?.freelancerWinsByDefault ? "Completed" : "Cancelled";
}

/** Status an action leads to. Only the automatic ruling depends on the agreement. */
export function actionTarget(action: AgreementAction, agreement: Pick<Agreement, "dispute">): AgreementStatus {
  return action === "resolveDispute" ? defaultRuling(agreement) : ACTIONS[action].to;
}

/** Facts about the viewer / chain that role and status alone cannot express. */
export interface ActionContext {
  /** `block.timestamp` is past the agreement deadline. */
  deadlinePassed?: boolean;
  /** The dispute window is over: anyone can apply the automatic ruling. */
  disputeWindowElapsed?: boolean;
}

export function canPerform(
  action: AgreementAction,
  role: Role,
  status: AgreementStatus,
  context: ActionContext = {},
): boolean {
  const def = ACTIONS[action];
  if (def.requires === "deadlinePassed" && !context.deadlinePassed) return false;
  if (def.requires === "disputeWindowElapsed" && !context.disputeWindowElapsed) return false;
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
export function waitingMessage(role: Role, status: AgreementStatus): string {
  if (role === "observer") {
    return status === "Disputed"
      ? "A dispute is open. After the dispute window anyone can apply the automatic ruling."
      : "You are not a party to this agreement. Actions are limited to the client and freelancer.";
  }
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
      return "";
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
