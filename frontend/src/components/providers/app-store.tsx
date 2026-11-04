"use client";

/**
 * In-memory application store used in demo mode. It simulates what will
 * later be read from / written to the ServiceAgreement and escrow contracts.
 * State lives for the browser session only (it resets on full reload).
 */
import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { ACTIONS, NEXT_MILESTONE_STATUS, type MilestoneAction } from "@/lib/lifecycle";
import { DEMO_USER, MOCK_AGREEMENTS, MOCK_MILESTONES, buildActivityFeed } from "@/lib/mock-data";
import { hashTerms } from "@/lib/ethereum";
import { randomHex, sameAddress, sleep } from "@/lib/utils";
import type {
  ActivityItem,
  Agreement,
  AgreementAction,
  AgreementEvent,
  CreateAgreementInput,
  Milestone,
  Party,
  Role,
} from "@/types/agreement";

interface State {
  agreements: Agreement[];
  milestones: Milestone[];
  /** Extra activity not tied to agreement status changes (milestones). */
  extraActivity: ActivityItem[];
}

type Event =
  | { type: "create"; agreement: Agreement }
  | { type: "transition"; id: string; action: AgreementAction; event: AgreementEvent }
  | { type: "milestone"; id: string; action: MilestoneAction; item: ActivityItem };

function reducer(state: State, e: Event): State {
  switch (e.type) {
    case "create":
      return { ...state, agreements: [e.agreement, ...state.agreements] };
    case "transition":
      return {
        ...state,
        agreements: state.agreements.map((a) =>
          a.id === e.id ? { ...a, status: ACTIONS[e.action].to, timeline: [...a.timeline, e.event] } : a,
        ),
        milestones:
          e.action === "approve"
            ? state.milestones.map((m) => (m.agreementId === e.id ? { ...m, status: "Released" } : m))
            : state.milestones,
      };
    case "milestone":
      return {
        ...state,
        milestones: state.milestones.map((m) =>
          m.id === e.id ? { ...m, status: NEXT_MILESTONE_STATUS[e.action] } : m,
        ),
        extraActivity: [e.item, ...state.extraActivity],
      };
  }
}

interface StoreValue extends State {
  user: Party;
  activity: ActivityItem[];
  getAgreement: (id: string) => Agreement | undefined;
  roleFor: (agreement: Agreement, address?: string | null) => Role;
  createAgreement: (input: CreateAgreementInput) => Promise<Agreement>;
  performAction: (agreementId: string, action: AgreementAction, actor: string) => Promise<AgreementEvent>;
  performMilestoneAction: (milestoneId: string, action: MilestoneAction, actor: string) => Promise<string>;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Simulated network latency for mock transactions. */
const MOCK_LATENCY = 1100;

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    agreements: MOCK_AGREEMENTS,
    milestones: MOCK_MILESTONES,
    extraActivity: [],
  });

  const getAgreement = useCallback((id: string) => state.agreements.find((a) => a.id === id), [state.agreements]);

  /** Role of "you": the demo persona or the connected wallet, if any. */
  const roleFor = useCallback((agreement: Agreement, walletAddress?: string | null): Role => {
    const mine = (addr: string) => sameAddress(addr, DEMO_USER.address) || sameAddress(addr, walletAddress);
    if (mine(agreement.client.address)) return "client";
    if (mine(agreement.freelancer.address)) return "freelancer";
    return "observer";
  }, []);

  const createAgreement = useCallback(
    async (input: CreateAgreementInput) => {
      await sleep(MOCK_LATENCY);
      const now = new Date().toISOString();
      const maxId = Math.max(...state.agreements.map((a) => a.onChainId));
      const onChainId = maxId + 1;
      const txHash = randomHex();
      const label = (address: string): Party =>
        sameAddress(address, DEMO_USER.address)
          ? DEMO_USER
          : { name: "External wallet", address, title: "Unverified party" };
      const agreement: Agreement = {
        id: `AGR-${onChainId}`,
        onChainId,
        title: input.title,
        description: input.description,
        terms: input.terms,
        client: label(input.clientAddress),
        freelancer: label(input.freelancerAddress),
        amountEth: input.amountEth,
        createdAt: now,
        deadline: new Date(`${input.deadline}T23:59:59.000Z`).toISOString(),
        status: "Created",
        txHash,
        termsHash: hashTerms(input.terms),
        documentName: input.documentName,
        timeline: [
          {
            id: `${onChainId}-AgreementCreated`,
            type: "AgreementCreated",
            date: now,
            actor: input.clientAddress,
            txHash,
          },
        ],
      };
      dispatch({ type: "create", agreement });
      return agreement;
    },
    [state.agreements],
  );

  const performAction = useCallback(async (agreementId: string, action: AgreementAction, actor: string) => {
    await sleep(MOCK_LATENCY);
    const event: AgreementEvent = {
      id: `${agreementId}-${ACTIONS[action].event}-${Date.now()}`,
      type: ACTIONS[action].event,
      date: new Date().toISOString(),
      actor,
      txHash: randomHex(),
    };
    dispatch({ type: "transition", id: agreementId, action, event });
    return event;
  }, []);

  const performMilestoneAction = useCallback(
    async (milestoneId: string, action: MilestoneAction, actor: string) => {
      await sleep(MOCK_LATENCY);
      const milestone = state.milestones.find((m) => m.id === milestoneId);
      const agreement = state.agreements.find((a) => a.id === milestone?.agreementId);
      const txHash = randomHex();
      if (milestone && agreement) {
        dispatch({
          type: "milestone",
          id: milestoneId,
          action,
          item: {
            id: `${milestoneId}-${action}-${Date.now()}`,
            type: action === "release" ? "PaymentReleased" : "MilestoneSubmitted",
            date: new Date().toISOString(),
            actor,
            txHash,
            agreementId: agreement.id,
            agreementTitle: agreement.title,
            amountEth: action === "release" ? milestone.amountEth : undefined,
            note: milestone.title,
          },
        });
      }
      return txHash;
    },
    [state.milestones, state.agreements],
  );

  const activity = useMemo(
    () => [...state.extraActivity, ...buildActivityFeed(state.agreements)].sort((a, b) => b.date.localeCompare(a.date)),
    [state.agreements, state.extraActivity],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      user: DEMO_USER,
      activity,
      getAgreement,
      roleFor,
      createAgreement,
      performAction,
      performMilestoneAction,
    }),
    [state, activity, getAgreement, roleFor, createAgreement, performAction, performMilestoneAction],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useAppStore must be used within <AppStoreProvider>");
  return ctx;
}
