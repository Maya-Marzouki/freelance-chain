/**
 * Agreement status values. The order mirrors the Solidity enum
 * `ServiceAgreement.Status` so that `AGREEMENT_STATUSES[index]` maps a uint8
 * returned by the contract to the frontend representation.
 */
export const AGREEMENT_STATUSES = [
  "Created",
  "Accepted",
  "InProgress",
  "Delivered",
  "Completed",
  "Cancelled",
  "Disputed",
] as const;

export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/** Role of the current user relative to an agreement. */
export type Role = "client" | "freelancer" | "observer";

/** Roles a demo user can impersonate in the simulated UI. */
export type DemoRole = Exclude<Role, "observer">;

export interface Party {
  name: string;
  address: string;
  /** Short descriptor, e.g. company or speciality. */
  title?: string;
}

export interface AgreementEvent {
  id: string;
  type: ActivityType;
  date: string; // ISO
  actor: string; // address
  /** Simulated transaction hash – never a real on-chain transaction. */
  txHash: string;
  note?: string;
}

/**
 * Context of a dispute. No arbiter: the contract ends it either when a party
 * concedes or, after the window, by an automatic rule anyone can trigger.
 */
export interface DisputeInfo {
  raisedBy: string;
  /** Status when the dispute was opened: decides the automatic ruling. */
  openedFrom: "InProgress" | "Delivered";
  openedAt: string; // ISO
  /** From this date anyone can apply the automatic ruling. */
  windowEndsAt: string; // ISO
  /** Outcome of the automatic ruling: true = Completed, false = Cancelled. */
  freelancerWinsByDefault: boolean;
}

export interface Agreement {
  id: string;
  /** Numeric id as it will be returned by the smart contract. */
  onChainId: number;
  title: string;
  description: string;
  terms: string;
  client: Party;
  freelancer: Party;
  amountEth: number;
  createdAt: string; // ISO
  deadline: string; // ISO
  status: AgreementStatus;
  /** Simulated creation transaction hash. */
  txHash: string;
  /** Simulated keccak256 hash of the terms (bytes32). */
  termsHash: string;
  documentName?: string;
  timeline: AgreementEvent[];
  /** Present when the agreement was ever disputed (live mode). */
  dispute?: DisputeInfo;
  /** Deliverable submitted by the freelancer: link and keccak256 hash of its content. */
  deliverable?: Deliverable;
  /** When the freelancer called `markDelivered` (ISO, live mode). Decides the on-time reward. */
  deliveredAt?: string;
}

/** Proof of a delivery: the file stays off-chain, only its hash is on-chain. */
export interface Deliverable {
  hash: string;
  uri: string;
}

/** Mirrors `EscrowMilestones.MilestoneStatus`; the demo flow never uses "Approved". */
export type MilestoneStatus = "Pending" | "Submitted" | "Approved" | "Released";

export interface Milestone {
  id: string;
  agreementId: string;
  title: string;
  description: string;
  amountEth: number;
  dueDate: string; // ISO
  status: MilestoneStatus;
  /** On-chain position, set when the milestone is read from `EscrowMilestones`. */
  escrowId?: number;
  index?: number;
  /** Link to the work, provided by the freelancer when submitting the milestone. */
  deliverableUri?: string;
}

/**
 * Status order mirrors the Solidity enum `EscrowMilestones.EscrowStatus`.
 */
export const ESCROW_STATUSES = ["Created", "Funded", "InProgress", "Completed", "Cancelled"] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

/** Funds held by `EscrowMilestones` for one agreement (live mode only). */
export interface Escrow {
  id: string;
  /** Id in the escrow contract. */
  escrowId: number;
  /** Frontend id of the linked agreement (`AGR-n`). */
  agreementId: string;
  client: string;
  freelancer: string;
  totalEth: number;
  depositedEth: number;
  releasedEth: number;
  status: EscrowStatus;
  milestoneCount: number;
}

export interface EscrowMilestoneInput {
  title: string;
  description: string;
  amountEth: number;
  dueDate: string; // yyyy-mm-dd
}

export type ActivityType =
  | "AgreementCreated"
  | "AgreementAccepted"
  | "WorkStarted"
  | "DeliverySubmitted"
  | "PaymentReleased"
  | "AgreementCompleted"
  | "AgreementCancelled"
  | "DisputeRaised"
  | "MilestoneSubmitted"
  | "ReputationRewarded";

export interface ActivityItem extends AgreementEvent {
  agreementId: string;
  agreementTitle: string;
  amountEth?: number;
}

/** Lifecycle actions a user can trigger on an agreement. */
export type AgreementAction =
  | "accept"
  | "start"
  | "deliver"
  | "approve"
  | "dispute"
  | "cancel"
  | "cancelOverdue"
  | "concedeAsClient"
  | "concedeAsFreelancer"
  | "resolveDispute";

/** Payload produced by the create-agreement form. */
export interface CreateAgreementInput {
  title: string;
  clientAddress: string;
  freelancerAddress: string;
  description: string;
  terms: string;
  amountEth: number;
  deadline: string; // yyyy-mm-dd
  documentName?: string;
}
