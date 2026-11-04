"use client";

/**
 * Application store with two modes:
 *
 * - demo: in-memory data that simulates the contracts (resets on full reload).
 * - chain: agreements are read from and written to the deployed
 *   `ServiceAgreement` contract (A), and funds / milestones to the
 *   `EscrowMilestones` contract (B). Active when A is deployed and the wallet is
 *   connected to the Hardhat network.
 */
import type { Contract } from "ethers";
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
import {
  createEscrowOnChain,
  escrowErrorMessage,
  fundEscrowOnChain,
  raiseEscrowDisputeOnChain,
  readEscrows,
  refundEscrowOnChain,
  releaseMilestoneOnChain,
  resolveEscrowDisputeOnChain,
  submitMilestoneOnChain,
} from "@/lib/escrow-chain";
import { getEscrowContract, getEscrowReader, isEscrowDeployed } from "@/lib/escrow-contract";
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
  Escrow,
  EscrowMilestoneInput,
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
  /** Reloads agreements and escrows from the blockchain (no-op in demo mode). */
  refresh: () => Promise<void>;
  /** Escrows read from `EscrowMilestones` (live mode only). */
  escrows: Escrow[];
  /** `EscrowMilestones` is deployed and readable: escrow actions are available. */
  escrowEnabled: boolean;
  /** Creates the escrow of an agreement; the total of the milestones must equal its amount. */
  createEscrow: (agreementId: string, milestones: EscrowMilestoneInput[]) => Promise<string>;
  fundEscrow: (escrowId: number) => Promise<string>;
  refundEscrow: (escrowId: number) => Promise<string>;
  disputeEscrow: (escrowId: number) => Promise<string>;
  resolveEscrow: (escrowId: number, favorFreelancer: boolean) => Promise<string>;
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
const NO_ESCROWS: Escrow[] = [];

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

  interface ChainState {
    status: ChainStatus;
    error: string | null;
    agreements: Agreement[];
    arbiter: string | null;
    escrowReady: boolean;
    escrows: Escrow[];
    milestones: Milestone[];
    activity: ActivityItem[];
  }
  const [chain, setChain] = useState<ChainState>({
    status: "idle",
    error: null,
    agreements: [],
    arbiter: null,
    escrowReady: false,
    escrows: [],
    milestones: [],
    activity: [],
  });

  const loadChain = useCallback(async (): Promise<Agreement[]> => {
    const { contract, provider } = getServiceAgreementReader();
    try {
      const [agreements, arbiter] = await Promise.all([readAgreements(contract, provider), readArbiter(contract)]);
      // The escrow contract is optional: agreements keep working if it is missing.
      let escrowPart = { escrowReady: false, escrows: [] as Escrow[], milestones: [] as Milestone[], activity: [] as ActivityItem[] };
      if (isEscrowDeployed) {
        try {
          const reader = getEscrowReader();
          escrowPart = { escrowReady: true, ...(await readEscrows(reader.contract, reader.provider, agreements)) };
        } catch {
          /* escrow contract not reachable at the saved address */
        }
      }
      setChain({ status: "ready", error: null, agreements, arbiter, ...escrowPart });
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
  const milestones = chainMode ? (chain.escrowReady ? chain.milestones : NO_MILESTONES) : state.milestones;
  const escrows = chainMode ? chain.escrows : NO_ESCROWS;
  const escrowEnabled = chainMode && chain.escrowReady;
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

  /** Runs an escrow transaction, then reloads the chain. Errors are translated for the user. */
  const withEscrow = useCallback(
    async <T,>(run: (contract: Contract) => Promise<T>): Promise<T> => {
      if (!chainMode || !chain.escrowReady) {
        throw new Error("Escrow actions need the wallet on the Hardhat network and EscrowMilestones deployed.");
      }
      const contract = await getEscrowContract();
      try {
        const result = await run(contract);
        await loadChain().catch(() => undefined);
        return result;
      } catch (err) {
        throw new Error(escrowErrorMessage(err, contract));
      }
    },
    [chainMode, chain.escrowReady, loadChain],
  );

  const createEscrow = useCallback(
    async (agreementId: string, input: EscrowMilestoneInput[]) => {
      const agreement = agreements.find((a) => a.id === agreementId);
      if (!agreement) throw new Error("Agreement not found.");
      if (!sameAddress(agreement.client.address, wallet.address)) {
        throw new Error("Only the client of the agreement can set up its escrow.");
      }
      if (!chain.arbiter) throw new Error("The arbiter could not be read from the agreement contract.");
      if (chain.escrows.some((e) => e.agreementId === agreementId)) throw new Error("This agreement already has an escrow.");
      const total = input.reduce((sum, m) => sum + m.amountEth, 0);
      if (Math.abs(total - agreement.amountEth) > 1e-9) {
        throw new Error(`The milestones must add up to the agreement amount (${agreement.amountEth} ETH).`);
      }
      return withEscrow(async (contract) => (await createEscrowOnChain(contract, agreement, chain.arbiter!, input)).txHash);
    },
    [agreements, wallet.address, chain.arbiter, chain.escrows, withEscrow],
  );

  const fundEscrow = useCallback((id: number) => withEscrow((c) => fundEscrowOnChain(c, id)), [withEscrow]);
  const refundEscrow = useCallback((id: number) => withEscrow((c) => refundEscrowOnChain(c, id)), [withEscrow]);
  const disputeEscrow = useCallback((id: number) => withEscrow((c) => raiseEscrowDisputeOnChain(c, id)), [withEscrow]);
  const resolveEscrow = useCallback(
    (id: number, favorFreelancer: boolean) => withEscrow((c) => resolveEscrowDisputeOnChain(c, id, favorFreelancer)),
    [withEscrow],
  );

  const performMilestoneAction = useCallback(
    async (milestoneId: string, action: MilestoneAction, actor: string) => {
      if (chainMode) {
        const target = chain.milestones.find((m) => m.id === milestoneId);
        if (!target || target.escrowId === undefined || target.index === undefined) {
          throw new Error("Milestone not found on the blockchain.");
        }
        const { escrowId, index, status } = target;
        return withEscrow((contract) =>
          action === "submit"
            ? submitMilestoneOnChain(contract, escrowId, index)
            : releaseMilestoneOnChain(contract, escrowId, index, status),
        );
      }
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
    [chainMode, chain.milestones, withEscrow, state.milestones, state.agreements],
  );

  const activity = useMemo(
    () =>
      [...(chainMode ? chain.activity : state.extraActivity), ...buildActivityFeed(agreements)].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    [chainMode, chain.activity, agreements, state.extraActivity],
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
      escrows,
      escrowEnabled,
      createEscrow,
      fundEscrow,
      refundEscrow,
      disputeEscrow,
      resolveEscrow,
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
      escrows,
      escrowEnabled,
      createEscrow,
      fundEscrow,
      refundEscrow,
      disputeEscrow,
      resolveEscrow,
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
