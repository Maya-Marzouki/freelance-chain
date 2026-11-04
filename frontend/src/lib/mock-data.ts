/**
 * Mock data used while the smart contracts are not deployed.
 *
 * Every hash and address in this file is generated deterministically from a
 * seed string. They are *simulated* values and do not correspond to real
 * on-chain transactions.
 */
import type {
  ActivityItem,
  ActivityType,
  Agreement,
  AgreementEvent,
  AgreementStatus,
  Milestone,
  Party,
} from "@/types/agreement";

/** Fixed reference date for the demo so renders are deterministic. */
export const MOCK_NOW = "2026-11-04T12:00:00.000Z";

/** Deterministic pseudo-random hex (FNV-1a based). Not cryptographic. */
function seededHex(seed: string, bytes: number): string {
  let out = "";
  let h = 0x811c9dc5;
  let i = 0;
  while (out.length < bytes * 2) {
    for (const ch of `${seed}:${i}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
    i++;
  }
  return `0x${out.slice(0, bytes * 2)}`;
}
export const mockAddress = (seed: string) => seededHex(`addr-${seed}`, 20);
export const mockTxHash = (seed: string) => seededHex(`tx-${seed}`, 32);

/** The demo persona representing "you" in the simulated application. */
export const DEMO_USER: Party = {
  name: "Alex Morgan",
  address: mockAddress("alex-morgan"),
  title: "Product Studio Lead",
};

const people = {
  nora: { name: "Nora Benali", address: mockAddress("nora"), title: "Full-stack Developer" },
  yassine: { name: "Yassine Trabelsi", address: mockAddress("yassine"), title: "Smart Contract Auditor" },
  lea: { name: "Léa Dubois", address: mockAddress("lea"), title: "Brand & UI Designer" },
  omar: { name: "Omar Haddad", address: mockAddress("omar"), title: "Mobile Engineer" },
  sofia: { name: "Sofia Rossi", address: mockAddress("sofia"), title: "Technical Writer" },
  kenji: { name: "Kenji Watanabe", address: mockAddress("kenji"), title: "Data Engineer" },
  atlas: { name: "Atlas Labs", address: mockAddress("atlas"), title: "DeFi Startup" },
  helio: { name: "Helio Commerce", address: mockAddress("helio"), title: "E-commerce Company" },
  medina: { name: "Medina Health", address: mockAddress("medina"), title: "HealthTech Scale-up" },
} satisfies Record<string, Party>;

/** Lifecycle event types reached for each status, in order. */
const LIFECYCLE: ActivityType[] = [
  "AgreementCreated",
  "AgreementAccepted",
  "WorkStarted",
  "DeliverySubmitted",
  "AgreementCompleted",
];

function addDays(iso: string, days: number, hours = 0): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString();
}

interface Seed {
  id: number;
  title: string;
  description: string;
  client: Party;
  freelancer: Party;
  amountEth: number;
  createdAt: string;
  durationDays: number;
  status: AgreementStatus;
  documentName?: string;
}

const DEFAULT_TERMS = `1. Scope: The freelancer delivers the work described above within the agreed deadline.
2. Payment: Funds are locked in escrow when the agreement is accepted and released upon client approval.
3. Revisions: Up to two rounds of revisions are included before final approval.
4. Disputes: Either party may raise a dispute before completion; funds remain locked until resolution.
5. Ownership: Intellectual property transfers to the client upon full payment.`;

function buildTimeline(seed: Seed): AgreementEvent[] {
  const progressIndex: Record<AgreementStatus, number> = {
    Created: 0,
    Accepted: 1,
    InProgress: 2,
    Delivered: 3,
    Completed: 4,
    Cancelled: 0,
    Disputed: 3,
  };
  const reached = LIFECYCLE.slice(0, progressIndex[seed.status] + 1);
  const events: AgreementEvent[] = reached.map((type, i) => ({
    id: `${seed.id}-${type}`,
    type,
    date: addDays(seed.createdAt, Math.round((i * seed.durationDays) / 5), 2 + i),
    actor:
      type === "AgreementCreated" || type === "AgreementCompleted"
        ? seed.client.address
        : seed.freelancer.address,
    txHash: mockTxHash(`${seed.id}-${type}`),
  }));
  if (seed.status === "Completed") {
    events.splice(events.length - 1, 0, {
      id: `${seed.id}-PaymentReleased`,
      type: "PaymentReleased",
      date: addDays(events[events.length - 1].date, 0, -1),
      actor: seed.client.address,
      txHash: mockTxHash(`${seed.id}-PaymentReleased`),
    });
  }
  if (seed.status === "Cancelled") {
    events.push({
      id: `${seed.id}-AgreementCancelled`,
      type: "AgreementCancelled",
      date: addDays(seed.createdAt, 2, 4),
      actor: seed.client.address,
      txHash: mockTxHash(`${seed.id}-AgreementCancelled`),
      note: "Project scope changed before acceptance.",
    });
  }
  if (seed.status === "Disputed") {
    events.push({
      id: `${seed.id}-DisputeRaised`,
      type: "DisputeRaised",
      date: addDays(events[events.length - 1].date, 2),
      actor: seed.client.address,
      txHash: mockTxHash(`${seed.id}-DisputeRaised`),
      note: "Delivered build does not meet acceptance criteria #3 and #4.",
    });
  }
  return events;
}

const SEEDS: Seed[] = [
  {
    id: 1042,
    title: "DeFi Dashboard Frontend",
    description:
      "Build a responsive React dashboard displaying liquidity pool positions, yield history and wallet balances, connected to existing subgraph endpoints.",
    client: DEMO_USER,
    freelancer: people.nora,
    amountEth: 4.2,
    createdAt: "2026-10-12T09:30:00.000Z",
    durationDays: 45,
    status: "InProgress",
    documentName: "dashboard-spec-v2.pdf",
  },
  {
    id: 1041,
    title: "Smart Contract Security Audit",
    description:
      "Full manual review and automated analysis of the staking and vesting contracts (approx. 1,200 SLOC), with a written report and remediation verification.",
    client: people.atlas,
    freelancer: DEMO_USER,
    amountEth: 8.5,
    createdAt: "2026-10-08T14:00:00.000Z",
    durationDays: 30,
    status: "Delivered",
    documentName: "audit-scope.pdf",
  },
  {
    id: 1040,
    title: "Brand Identity & Design System",
    description:
      "Logo refresh, typography and color system, plus a Figma component library covering 40+ components for the product team.",
    client: DEMO_USER,
    freelancer: people.lea,
    amountEth: 2.75,
    createdAt: "2026-10-28T11:15:00.000Z",
    durationDays: 28,
    status: "Created",
  },
  {
    id: 1039,
    title: "Mobile Wallet Onboarding Flow",
    description:
      "Implement the onboarding screens, seedless account creation and biometric unlock for the React Native wallet application.",
    client: people.helio,
    freelancer: DEMO_USER,
    amountEth: 3.1,
    createdAt: "2026-10-25T08:00:00.000Z",
    durationDays: 35,
    status: "Accepted",
  },
  {
    id: 1038,
    title: "Developer Documentation Portal",
    description:
      "Write and structure API reference, quick-start guides and SDK tutorials for the public developer portal.",
    client: DEMO_USER,
    freelancer: people.sofia,
    amountEth: 1.6,
    createdAt: "2026-09-02T10:00:00.000Z",
    durationDays: 30,
    status: "Completed",
  },
  {
    id: 1037,
    title: "Patient Data Pipeline",
    description:
      "Design an ETL pipeline ingesting anonymised patient records into a warehouse with automated data-quality checks and lineage.",
    client: people.medina,
    freelancer: people.kenji,
    amountEth: 6.0,
    createdAt: "2026-09-18T13:45:00.000Z",
    durationDays: 40,
    status: "Disputed",
  },
  {
    id: 1036,
    title: "NFT Marketplace Landing Page",
    description: "High-conversion landing page with collection showcase, mint countdown and analytics integration.",
    client: DEMO_USER,
    freelancer: people.omar,
    amountEth: 0.9,
    createdAt: "2026-09-10T16:20:00.000Z",
    durationDays: 14,
    status: "Cancelled",
  },
  {
    id: 1035,
    title: "Token Vesting Contract Integration",
    description: "Integrate the vesting contract into the investor portal with claim flows and schedule visualisation.",
    client: people.atlas,
    freelancer: DEMO_USER,
    amountEth: 2.2,
    createdAt: "2026-08-21T09:00:00.000Z",
    durationDays: 21,
    status: "Completed",
  },
  {
    id: 1034,
    title: "Checkout Performance Optimisation",
    description: "Profile and optimise the checkout funnel to reach a sub-1s LCP on mobile devices.",
    client: people.helio,
    freelancer: people.nora,
    amountEth: 1.8,
    createdAt: "2026-10-30T07:30:00.000Z",
    durationDays: 20,
    status: "InProgress",
  },
  {
    id: 1033,
    title: "DAO Governance Module",
    description: "Proposal creation, snapshot voting UI and execution queue for an on-chain governance module.",
    client: DEMO_USER,
    freelancer: people.yassine,
    amountEth: 5.4,
    createdAt: "2026-10-20T12:00:00.000Z",
    durationDays: 50,
    status: "Accepted",
  },
  {
    id: 1032,
    title: "Telemedicine App UI Kit",
    description: "Accessible UI kit for the telemedicine app including booking, video call and prescription screens.",
    client: people.medina,
    freelancer: people.lea,
    amountEth: 2.4,
    createdAt: "2026-08-05T15:00:00.000Z",
    durationDays: 30,
    status: "Completed",
  },
  {
    id: 1031,
    title: "Indexer & GraphQL API",
    description: "Event indexer for marketplace contracts exposing a typed GraphQL API with pagination and filters.",
    client: DEMO_USER,
    freelancer: people.kenji,
    amountEth: 3.6,
    createdAt: "2026-11-01T10:00:00.000Z",
    durationDays: 30,
    status: "Created",
  },
  {
    id: 1030,
    title: "Multi-language Localisation",
    description: "Localise the marketing site and app into French, Arabic (RTL) and Spanish.",
    client: people.helio,
    freelancer: people.sofia,
    amountEth: 0.75,
    createdAt: "2026-07-14T09:00:00.000Z",
    durationDays: 18,
    status: "Completed",
  },
];

export const MOCK_AGREEMENTS: Agreement[] = SEEDS.map((seed) => ({
  id: `AGR-${seed.id}`,
  onChainId: seed.id,
  title: seed.title,
  description: seed.description,
  terms: DEFAULT_TERMS,
  client: seed.client,
  freelancer: seed.freelancer,
  amountEth: seed.amountEth,
  createdAt: seed.createdAt,
  deadline: addDays(seed.createdAt, seed.durationDays),
  status: seed.status,
  txHash: mockTxHash(`${seed.id}-AgreementCreated`),
  termsHash: seededHex(`terms-${seed.id}`, 32),
  documentName: seed.documentName,
  timeline: buildTimeline(seed),
}));

/** Milestones for agreements that use escrow. */
export const MOCK_MILESTONES: Milestone[] = [
  // AGR-1042 – DeFi Dashboard (InProgress)
  { id: "MS-1042-1", agreementId: "AGR-1042", title: "Wireframes & architecture", description: "Low-fidelity wireframes and component architecture document.", amountEth: 0.8, dueDate: "2026-10-20T00:00:00.000Z", status: "Released" },
  { id: "MS-1042-2", agreementId: "AGR-1042", title: "Core dashboard views", description: "Positions, balances and yield history views wired to the subgraph.", amountEth: 1.6, dueDate: "2026-11-08T00:00:00.000Z", status: "Submitted" },
  { id: "MS-1042-3", agreementId: "AGR-1042", title: "Polish, tests & handover", description: "Responsive polish, unit tests and deployment handover.", amountEth: 1.8, dueDate: "2026-11-26T00:00:00.000Z", status: "Pending" },
  // AGR-1041 – Audit (Delivered)
  { id: "MS-1041-1", agreementId: "AGR-1041", title: "Automated analysis", description: "Static analysis and fuzzing results with triage.", amountEth: 2.5, dueDate: "2026-10-16T00:00:00.000Z", status: "Released" },
  { id: "MS-1041-2", agreementId: "AGR-1041", title: "Manual review report", description: "Detailed findings report with severity classification.", amountEth: 4.0, dueDate: "2026-10-30T00:00:00.000Z", status: "Released" },
  { id: "MS-1041-3", agreementId: "AGR-1041", title: "Remediation verification", description: "Verify fixes and publish the final report.", amountEth: 2.0, dueDate: "2026-11-07T00:00:00.000Z", status: "Submitted" },
  // AGR-1039 – Mobile onboarding (Accepted)
  { id: "MS-1039-1", agreementId: "AGR-1039", title: "Onboarding screens", description: "Implement the five onboarding screens with animations.", amountEth: 1.2, dueDate: "2026-11-10T00:00:00.000Z", status: "Pending" },
  { id: "MS-1039-2", agreementId: "AGR-1039", title: "Biometric unlock", description: "Face ID / fingerprint unlock with secure enclave storage.", amountEth: 1.9, dueDate: "2026-11-29T00:00:00.000Z", status: "Pending" },
  // AGR-1033 – DAO governance (Accepted)
  { id: "MS-1033-1", agreementId: "AGR-1033", title: "Proposal creation", description: "Proposal form, validation and on-chain submission flow.", amountEth: 1.8, dueDate: "2026-11-15T00:00:00.000Z", status: "Pending" },
  { id: "MS-1033-2", agreementId: "AGR-1033", title: "Voting interface", description: "Snapshot voting UI with delegation support.", amountEth: 2.0, dueDate: "2026-11-30T00:00:00.000Z", status: "Pending" },
  { id: "MS-1033-3", agreementId: "AGR-1033", title: "Execution queue", description: "Timelock queue and execution dashboard.", amountEth: 1.6, dueDate: "2026-12-09T00:00:00.000Z", status: "Pending" },
  // AGR-1038 – Docs (Completed)
  { id: "MS-1038-1", agreementId: "AGR-1038", title: "Quick-start guides", description: "Getting started guides for the three SDKs.", amountEth: 0.6, dueDate: "2026-09-15T00:00:00.000Z", status: "Released" },
  { id: "MS-1038-2", agreementId: "AGR-1038", title: "API reference", description: "Complete REST and GraphQL reference.", amountEth: 1.0, dueDate: "2026-10-02T00:00:00.000Z", status: "Released" },
];

/** Flatten every agreement's timeline into a global activity feed (newest first). */
export function buildActivityFeed(agreements: Agreement[]): ActivityItem[] {
  return agreements
    .flatMap((a) =>
      a.timeline.map<ActivityItem>((e) => ({
        ...e,
        agreementId: a.id,
        agreementTitle: a.title,
        amountEth: e.type === "PaymentReleased" || e.type === "AgreementCreated" ? a.amountEth : undefined,
      })),
    )
    .sort((x, y) => y.date.localeCompare(x.date));
}

export const MOCK_NOTIFICATIONS = [
  { id: "n1", title: "Milestone submitted for review", body: "Nora Benali submitted “Core dashboard views”.", time: "2h ago", unread: true },
  { id: "n2", title: "Delivery awaiting approval", body: "Atlas Labs is reviewing your audit delivery.", time: "5h ago", unread: true },
  { id: "n3", title: "New agreement proposal", body: "Kenji Watanabe was invited to “Indexer & GraphQL API”.", time: "3d ago", unread: false },
];
