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
};

export const ACTION_ORDER: AgreementAction[] = ["accept", "start", "deliver", "approve", "dispute", "cancel"];

export function canPerform(action: AgreementAction, role: Role, status: AgreementStatus): boolean {
  const def = ACTIONS[action];
  return def.allowedRoles.includes(role) && def.from.includes(status);
}

export function availableActions(role: Role, status: AgreementStatus): ActionDefinition[] {
  return ACTION_ORDER.filter((a) => canPerform(a, role, status)).map((a) => ACTIONS[a]);
}

/** Explains why nothing is actionable, for empty action panels. */
export function waitingMessage(role: Role, status: AgreementStatus): string {
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
      return "A dispute is open. Funds remain locked until it is resolved.";
  }
}

/** Ordered happy-path steps used by progress indicators. */
export const HAPPY_PATH: AgreementStatus[] = ["Created", "Accepted", "InProgress", "Delivered", "Completed"];

/* -------------------------------- Milestones ------------------------------- */

export type MilestoneAction = "submit" | "release";

export function milestoneAction(
  milestone: Milestone,
  role: Role,
  agreementStatus: AgreementStatus,
): MilestoneAction | null {
  const workOpen = agreementStatus === "Accepted" || agreementStatus === "InProgress" || agreementStatus === "Delivered";
  if (!workOpen) return null;
  if (milestone.status === "Pending" && role === "freelancer") return "submit";
  if (milestone.status === "Submitted" && role === "client") return "release";
  return null;
}

export const NEXT_MILESTONE_STATUS: Record<MilestoneAction, MilestoneStatus> = {
  submit: "Submitted",
  release: "Released",
};
