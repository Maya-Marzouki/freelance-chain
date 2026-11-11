"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import {
  LATE_REWARD_PERCENT,
  expectedRewards,
  isDeliveredOnTime,
  claimReputation,
  isReputationDeployed,
  readReputation,
  type ReputationSnapshot,
} from "@/lib/reputation-contract";
import type { Agreement, Role } from "@/types/agreement";

const formatFlr = (value: number) =>
  `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} FLR`;

interface Props {
  agreement: Agreement;
  /** Role of the connected wallet on this agreement. */
  role: Role;
}

/** Live-mode card of the reputation token (C): balance, and the reward of this agreement. */
export function ReputationCard({ agreement, role }: Props) {
  const { mode, escrows, refresh } = useAppStore();
  const wallet = useWallet();
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<ReputationSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const enabled = mode === "chain" && isReputationDeployed;
  const escrow = escrows.find((e) => e.agreementId === agreement.id);
  const paid = escrow?.status === "Completed" ? escrow.releasedEth : 0;

  // Bumped after a claim to read the contract again.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    readReputation(wallet.address, agreement.onChainId)
      .then((s) => !cancelled && setSnapshot(s))
      .catch(() => !cancelled && setSnapshot(null));
    return () => {
      cancelled = true;
    };
  }, [enabled, wallet.address, agreement.onChainId, agreement.status, escrow?.status, version]);

  if (!enabled) return null;

  const eligible = agreement.status === "Completed" && escrow?.status === "Completed";
  const onTime = isDeliveredOnTime(agreement);
  const expected = expectedRewards(paid, onTime);

  async function claim() {
    setLoading(true);
    try {
      await claimReputation(agreement.onChainId);
      toast.success("Reputation minted", "FLR tokens sent to the client and the freelancer.");
      setVersion((v) => v + 1);
      await refresh();
    } catch (err) {
      toast.error("Claim failed", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  let status: React.ReactNode;
  if (snapshot?.rewardClaimed) {
    status = <p className="text-sm text-emerald-700">Reputation already minted for this agreement.</p>;
  } else if (eligible) {
    status = (
      <>
        <p className="text-sm text-slate-500">
          Mission completed and paid. Reward: {formatFlr(expected.freelancerFlr)} for the freelancer,{" "}
          {formatFlr(expected.clientFlr)} for the client.
        </p>
        {onTime ? (
          <p className="text-xs text-emerald-700">Delivered on time: the freelancer gets the full reward.</p>
        ) : (
          <p className="text-xs text-amber-700">
            Not delivered by the deadline: the freelancer gets {LATE_REWARD_PERCENT}% of the reward. The client keeps
            their full share.
          </p>
        )}
        <Button size="sm" loading={loading} onClick={claim}>
          <Award className="size-4" aria-hidden /> Claim reputation
        </Button>
      </>
    );
  } else {
    status = (
      <p className="text-sm text-slate-500">
        Reputation is minted once the agreement is completed and the escrow has paid the freelancer in full.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader title="Reputation" description="Soulbound FLR token, earned by finishing paid missions" />
      <CardBody className="space-y-3">
        {role !== "observer" && snapshot && (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5 text-sm">
            <span className="text-slate-500">Your reputation</span>
            <span className="font-medium text-navy-900">
              {formatFlr(snapshot.balance)} · {snapshot.missionsCompleted} mission
              {snapshot.missionsCompleted === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {status}
      </CardBody>
    </Card>
  );
}
