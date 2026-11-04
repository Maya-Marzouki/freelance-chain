"use client";

/**
 * Application store with two modes:
 *
 * - demo: in-memory data that simulates the contracts (resets on full reload).
 * - chain: agreements are read from and written to the deployed
 *   `ServiceAgreement` contract. Active when the contract is deployed and the
 *   wallet is connected to the Hardhat network. Escrow milestones (contract B)
 *   are not on-chain yet and stay empty in this mode.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { saveMeta } from "@/lib/agreement-meta";
import {
  chainErrorMessage,
  createOnChain,
  readAgreements,
  readArbiter,
  sendAction,
} from "@/lib/agreement-chain";
import { getServiceAgreementReader } from "@/lib/agreement-contract";
import { ACTIONS, NEXT_MILESTONE_STATUS, type MilestoneAction } from "@/lib/lifecycle";
import { DEMO_USER, MOCK_AGREEMENTS, MOCK_MILESTONES, buildActivityFeed } from "@/lib/mock-data";
import { HARDHAT_CHAIN_ID, getServiceAgreementContract, hashTerms, isContractDeployed } from "@/lib/ethereum";
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

export type StoreMode = "demo" | "chain";
export type ChainStatus = "idle" | "loading" | "ready" | "error";

interface StoreValue extends State {
  mode: StoreMode;
  chainStatus: ChainStatus;
  chainError: string | null;
  /** Address allowed to resolve disputes (chain mode only). */
  arbiterAddress: string | null;
  /** Reloads agreements from the blockchain (no-op in demo mode). */
  refresh: () => Promise<void>;
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
const CHAIN_POLL_MS = 5000;
const NO_MILESTONES: Milestone[] = [];

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    agreements: MOCK_AGREEMENTS,
    milestones: MOCK_MILESTONES,
    extraActivity: [],
  });

  const wallet = useWallet();
  const mode: StoreMode =
    isContractDeployed && wallet.status === "connected" && wallet.network?.chainId === HARDHAT_CHAIN_ID
      ? "chain"
      : "demo";
  const chainMode = mode === "chain";

  const [chain, setChain] = useState<{ status: ChainStatus; error: string | null; agreements: Agreement[]; arbiter: string | null }>({
    status: "idle",
    error: null,
    agreements: [],
    arbiter: null,
  });

  const loadChain = useCallback(async (): Promise<Agreement[]> => {
    const { contract, provider } = getServiceAgreementReader();
    try {
      const [agreements, arbiter] = await Promise.all([readAgreements(contract, provider), readArbiter(contract)]);
      setChain({ status: "ready", error: null, agreements, arbiter });
      return agreements;
    } catch (err) {
      setChain((c) => ({ ...c, status: "error", error: chainErrorMessage(err, contract) }));
      throw err;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!chainMode) return;
    await loadChain().catch(() => undefined);
  }, [chainMode, loadChain]);

  useEffect(() => {
    if (!chainMode) return;
    void refresh();
    const timer = setInterval(() => void refresh(), CHAIN_POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [chainMode, refresh]);

  const agreements = chainMode ? chain.agreements : state.agreements;
  const milestones = chainMode ? NO_MILESTONES : state.milestones;
  const chainStatus: ChainStatus = chainMode ? (chain.status === "idle" ? "loading" : chain.status) : "idle";

  const getAgreement = useCallback((id: string) => agreements.find((a) => a.id === id), [agreements]);

  /** Role of "you": the demo persona or the connected wallet, if any. */
  const roleFor = useCallback((agreement: Agreement, walletAddress?: string | null): Role => {
    const mine = (addr: string) => sameAddress(addr, DEMO_USER.address) || sameAddress(addr, walletAddress);
    if (mine(agreement.client.address)) return "client";
    if (mine(agreement.freelancer.address)) return "freelancer";
    return "observer";
  }, []);

  const createAgreement = useCallback(
    async (input: CreateAgreementInput) => {
      if (chainMode) {
        if (!sameAddress(input.clientAddress, wallet.address)) {
          throw new Error("The client of an on-chain agreement is the connected wallet. Use your wallet address.");
        }
        const contract = await getServiceAgreementContract();
        try {
          const { onChainId, termsHash } = await createOnChain(contract, input);
          saveMeta(termsHash, {
            description: input.description,
            terms: input.terms,
            documentName: input.documentName,
          });
          const created = (await loadChain()).find((a) => a.onChainId === onChainId);
          if (!created) throw new Error("The agreement was created but could not be read back. Refresh the page.");
          return created;
        } catch (err) {
          throw new Error(chainErrorMessage(err, contract));
        }
      }
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
    [chainMode, wallet.address, loadChain, state.agreements],
  );

  const performAction = useCallback(
    async (agreementId: string, action: AgreementAction, actor: string) => {
    if (chainMode) {
      const target = agreements.find((a) => a.id === agreementId);
      if (!target) throw new Error("Agreement not found on the blockchain.");
      const contract = await getServiceAgreementContract();
      try {
        const txHash = await sendAction(contract, action, target.onChainId);
        await loadChain().catch(() => undefined);
        return {
          id: `${agreementId}-${ACTIONS[action].event}-${txHash}`,
          type: ACTIONS[action].event,
          date: new Date().toISOString(),
          actor: wallet.address ?? actor,
          txHash,
        } satisfies AgreementEvent;
      } catch (err) {
        throw new Error(chainErrorMessage(err, contract));
      }
    }
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
    },
    [chainMode, agreements, wallet.address, loadChain],
  );

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
    () =>
      [...(chainMode ? [] : state.extraActivity), ...buildActivityFeed(agreements)].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    [chainMode, agreements, state.extraActivity],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      agreements,
      milestones,
      mode,
      chainStatus,
      chainError: chainMode ? chain.error : null,
      arbiterAddress: chainMode ? chain.arbiter : null,
      refresh,
      user: DEMO_USER,
      activity,
      getAgreement,
      roleFor,
      createAgreement,
      performAction,
      performMilestoneAction,
    }),
    [
      state,
      agreements,
      milestones,
      mode,
      chainMode,
      chainStatus,
      chain.error,
      chain.arbiter,
      refresh,
      activity,
      getAgreement,
      roleFor,
      createAgreement,
      performAction,
      performMilestoneAction,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useAppStore must be used within <AppStoreProvider>");
  return ctx;
}
