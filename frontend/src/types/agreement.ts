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

/**
 * Role selectable in the demo role switcher. The arbiter is not a party to the
 * agreement: on-chain it is a single address set when the contract is deployed.
 */
export type ViewRole = Role | "arbiter";

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
}

export type MilestoneStatus = "Pending" | "Submitted" | "Released";

export interface Milestone {
  id: string;
  agreementId: string;
  title: string;
  description: string;
  amountEth: number;
  dueDate: string; // ISO
  status: MilestoneStatus;
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
  | "MilestoneSubmitted";

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
  | "resolveForFreelancer"
  | "resolveForClient";

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
