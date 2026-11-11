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
  readChainTime,
  sendAction,
} from "@/lib/agreement-chain";
import { getServiceAgreementReader } from "@/lib/agreement-contract";
import {
  createEscrowOnChain,
  escrowErrorMessage,
  fundEscrowOnChain,
  readEscrows,
  releaseMilestoneOnChain,
  settleEscrowOnChain,
  submitMilestoneOnChain,
} from "@/lib/escrow-chain";
import { getEscrowContract, getEscrowReader, isEscrowDeployed } from "@/lib/escrow-contract";
import { LATE_REWARD_PERCENT, isReputationDeployed, readRewards, type RewardRecord } from "@/lib/reputation-contract";
import { ACTIONS, NEXT_MILESTONE_STATUS, actionTarget, type MilestoneAction } from "@/lib/lifecycle";
import { DEMO_USER, MOCK_AGREEMENTS, MOCK_MILESTONES, MOCK_NOW, buildActivityFeed } from "@/lib/mock-data";
import { HARDHAT_CHAIN_ID, getServiceAgreementContract, getSigner, hashTerms, isContractDeployed } from "@/lib/ethereum";
import { randomHex, sameAddress, shortenAddress, sleep } from "@/lib/utils";
import type {
  ActivityItem,
  Agreement,
  AgreementAction,
  AgreementEvent,
  AgreementStatus,
  CreateAgreementInput,
  Deliverable,
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
  | {
      type: "transition";
      id: string;
      action: AgreementAction;
      to: AgreementStatus;
      event: AgreementEvent;
      deliverable?: Deliverable;
    }
  | { type: "milestone"; id: string; action: MilestoneAction; item: ActivityItem; deliverableUri?: string };

function reducer(state: State, e: Event): State {
  switch (e.type) {
    case "create":
      return { ...state, agreements: [e.agreement, ...state.agreements] };
    case "transition":
      return {
        ...state,
        agreements: state.agreements.map((a) =>
          a.id === e.id
            ? { ...a, status: e.to, timeline: [...a.timeline, e.event], deliverable: e.deliverable ?? a.deliverable }
            : a,
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
          m.id === e.id
            ? { ...m, status: NEXT_MILESTONE_STATUS[e.action], deliverableUri: e.deliverableUri ?? m.deliverableUri }
            : m,
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
  /**
   * "Now" for deadlines and dispute windows, in ms: the latest block time in live mode
   * (the clock the contracts use), a fixed date in demo mode.
   */
  nowMs: number;
  /** Reloads agreements and escrows from the blockchain (no-op in demo mode). */
  refresh: () => Promise<void>;
  /** Escrows read from `EscrowMilestones` (live mode only). */
  escrows: Escrow[];
  /** `EscrowMilestones` is deployed and readable: escrow actions are available. */
  escrowEnabled: boolean;
  /** Why the escrow contract could not be read (live mode), e.g. it was not redeployed. */
  escrowError: string | null;
  /** Reputation (FLR) minted so far, read from `ReputationToken` (live mode only). */
  rewards: RewardRecord[];
  /** Why the reputation contract could not be read (live mode), e.g. it was not redeployed. */
  rewardsError: string | null;
  /** Creates the escrow of an agreement; the total of the milestones must equal its amount. */
  createEscrow: (agreementId: string, milestones: EscrowMilestoneInput[]) => Promise<string>;
  fundEscrow: (escrowId: number) => Promise<string>;
  /** Pays the freelancer or refunds the client once the agreement is Completed or Cancelled. */
  settleEscrow: (escrowId: number) => Promise<string>;
  user: Party;
  activity: ActivityItem[];
  getAgreement: (id: string) => Agreement | undefined;
  roleFor: (agreement: Agreement, address?: string | null) => Role;
  createAgreement: (input: CreateAgreementInput) => Promise<Agreement>;
  /** `deliverable` is required for the "deliver" action. */
  performAction: (
    agreementId: string,
    action: AgreementAction,
    actor: string,
    deliverable?: Deliverable,
  ) => Promise<AgreementEvent>;
  /** `deliverableUri` is required for the "submit" action. */
  performMilestoneAction: (
    milestoneId: string,
    action: MilestoneAction,
    actor: string,
    deliverableUri?: string,
  ) => Promise<string>;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Simulated network latency for mock transactions. */
const MOCK_LATENCY = 1100;
const CHAIN_POLL_MS = 5000;
const NO_MILESTONES: Milestone[] = [];
const NO_ESCROWS: Escrow[] = [];
const NO_REWARDS: RewardRecord[] = [];

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
    now: number;
    escrowReady: boolean;
    escrowError: string | null;
    escrows: Escrow[];
    milestones: Milestone[];
    activity: ActivityItem[];
    rewards: RewardRecord[];
    rewardsError: string | null;
  }
  const [chain, setChain] = useState<ChainState>({
    status: "idle",
    error: null,
    agreements: [],
    now: 0,
    escrowReady: false,
    escrowError: null,
    escrows: [],
    milestones: [],
    activity: [],
    rewards: [],
    rewardsError: null,
  });

  const loadChain = useCallback(async (): Promise<Agreement[]> => {
    const { contract, provider } = getServiceAgreementReader();
    try {
      const [agreements, now] = await Promise.all([readAgreements(contract, provider), readChainTime(provider)]);
      // The escrow contract is optional: agreements keep working if it is missing.
      let escrowPart = {
        escrowReady: false,
        escrowError: null as string | null,
        escrows: [] as Escrow[],
        milestones: [] as Milestone[],
        activity: [] as ActivityItem[],
      };
      if (isEscrowDeployed) {
        try {
          const reader = getEscrowReader();
          escrowPart = { ...escrowPart, escrowReady: true, ...(await readEscrows(reader.contract, reader.provider, agreements)) };
        } catch (err) {
          // Usually the contract on the node is older than the ABI in `src/contracts` (not redeployed).
          console.error("EscrowMilestones could not be read:", err);
          escrowPart = {
            ...escrowPart,
            escrowError:
              "The escrow contract on the local node does not match this version of the app. Run npm run deploy:local in the blockchain folder, then reload.",
          };
        }
      }
      // The reputation token is optional too: rewards and their history events.
      let rewards: RewardRecord[] = [];
      let rewardsError: string | null = null;
      if (isReputationDeployed) {
        try {
          rewards = await readRewards(new Map(agreements.map((a) => [a.id, a.title])));
        } catch (err) {
          // Usually the token on the node is older than the ABI in `src/contracts` (not redeployed).
          console.error("ReputationToken could not be read:", err);
          rewardsError =
            "The reputation contract on the local node does not match this version of the app. Run npm run deploy:local in the blockchain folder, then reload.";
        }
      }
      const rewardActivity: ActivityItem[] = rewards.map((r) => ({
        id: r.id,
        type: "ReputationRewarded",
        date: r.date,
        actor: r.actor,
        txHash: r.txHash,
        agreementId: r.agreementId,
        agreementTitle: r.agreementTitle,
        note: `+${r.freelancerFlr} FLR freelancer${r.onTime ? "" : ` (late delivery, ${LATE_REWARD_PERCENT}%)`}, +${r.clientFlr} FLR client`,
      }));
      setChain({
        status: "ready",
        error: null,
        agreements,
        now,
        ...escrowPart,
        activity: [...escrowPart.activity, ...rewardActivity],
        rewards,
        rewardsError,
      });
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
  const escrowError = chainMode ? chain.escrowError : null;
  const rewards = chainMode ? chain.rewards : NO_REWARDS;
  const rewardsError = chainMode ? chain.rewardsError : null;
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
        // The contract takes the signing account as client (`msg.sender`): check the account
        // MetaMask will really use, which can differ from the one shown if it was switched.
        const signer = await getSigner();
        const from = await signer.getAddress();
        if (!sameAddress(from, input.clientAddress)) {
          throw new Error(
            `MetaMask is signing with ${shortenAddress(from, 6)}, not the client ${shortenAddress(input.clientAddress, 6)}. Select the client account in MetaMask, reload the page, then try again.`,
          );
        }
        if (sameAddress(from, input.freelancerAddress)) {
          throw new Error(
            "The freelancer address is the account signing in MetaMask. Select the client account in MetaMask, or enter the freelancer's own address.",
          );
        }
        const contract = await getServiceAgreementContract(signer);
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
    async (agreementId: string, action: AgreementAction, actor: string, deliverable?: Deliverable) => {
    if (action === "deliver" && !deliverable) throw new Error("Add a link to your deliverable before submitting.");
    if (chainMode) {
      const target = agreements.find((a) => a.id === agreementId);
      if (!target) throw new Error("Agreement not found on the blockchain.");
      const contract = await getServiceAgreementContract();
      try {
        const txHash = await sendAction(contract, action, target.onChainId, deliverable);
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
    const current = state.agreements.find((a) => a.id === agreementId);
    dispatch({
      type: "transition",
      id: agreementId,
      action,
      to: current ? actionTarget(action, current) : ACTIONS[action].to,
      event,
      deliverable,
    });
    return event;
    },
    [chainMode, agreements, wallet.address, loadChain, state.agreements],
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
      if (chain.escrows.some((e) => e.agreementId === agreementId)) throw new Error("This agreement already has an escrow.");
      const total = input.reduce((sum, m) => sum + m.amountEth, 0);
      if (Math.abs(total - agreement.amountEth) > 1e-9) {
        throw new Error(`The milestones must add up to the agreement amount (${agreement.amountEth} ETH).`);
      }
      return withEscrow(async (contract) => (await createEscrowOnChain(contract, agreement, input)).txHash);
    },
    [agreements, wallet.address, chain.escrows, withEscrow],
  );

  const fundEscrow = useCallback((id: number) => withEscrow((c) => fundEscrowOnChain(c, id)), [withEscrow]);
  const settleEscrow = useCallback((id: number) => withEscrow((c) => settleEscrowOnChain(c, id)), [withEscrow]);

  const performMilestoneAction = useCallback(
    async (milestoneId: string, action: MilestoneAction, actor: string, deliverableUri?: string) => {
      if (action === "submit" && !deliverableUri) {
        throw new Error("Add a link to the milestone deliverable before submitting.");
      }
      if (chainMode) {
        const target = chain.milestones.find((m) => m.id === milestoneId);
        if (!target || target.escrowId === undefined || target.index === undefined) {
          throw new Error("Milestone not found on the blockchain.");
        }
        const { escrowId, index, status } = target;
        return withEscrow((contract) =>
          action === "submit"
            ? submitMilestoneOnChain(contract, escrowId, index, deliverableUri!)
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
          deliverableUri,
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
      nowMs: chainMode ? chain.now : new Date(MOCK_NOW).getTime(),
      refresh,
      escrows,
      escrowEnabled,
      escrowError,
      rewards,
      rewardsError,
      createEscrow,
      fundEscrow,
      settleEscrow,
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
      chain.now,
      refresh,
      escrows,
      escrowEnabled,
      escrowError,
      rewards,
      rewardsError,
      createEscrow,
      fundEscrow,
      settleEscrow,
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
