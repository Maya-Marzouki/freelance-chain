"use client";

import { useMemo, useState } from "react";
import { Award, BadgeCheck, Clock, Hourglass, Info } from "lucide-react";
import Link from "@/components/space/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatCard } from "@/components/dashboard/stat-card";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { useScoped } from "@/components/space/use-scoped";
import { useSpace } from "@/components/space/space-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import {
  CLIENT_RATE,
  FREELANCER_RATE,
  LATE_REWARD_PERCENT,
  claimReputation,
  expectedRewards,
  isDeliveredOnTime,
  isReputationDeployed,
} from "@/lib/reputation-contract";
import { formatDateTime, formatEth, sameAddress, shortenHash } from "@/lib/utils";

const formatFlr = (value: number) => `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} FLR`;

/** On time: full reward. Late or never delivered: the freelancer's share is reduced. */
function DeadlineBadge({ onTime }: { onTime: boolean }) {
  return onTime ? (
    <span className="ml-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100 ring-inset">
      Delivered on time
    </span>
  ) : (
    <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100 ring-inset">
      Late delivery: freelancer {LATE_REWARD_PERCENT}%
    </span>
  );
}

/** Rewards tab: FLR earned, agreements ready to claim, and the reward history. */
export function RewardsView() {
  const { mode, rewards, rewardsError, refresh } = useAppStore();
  const { agreements, escrows } = useScoped();
  const space = useSpace();
  const wallet = useWallet();
  const toast = useToast();
  const [claiming, setClaiming] = useState<string | null>(null);

  const live = mode === "chain" && isReputationDeployed;
  const isFreelancer = space === "freelancer";
  const shareOf = (r: { freelancerFlr: number; clientFlr: number }) => (isFreelancer ? r.freelancerFlr : r.clientFlr);

  const mine = useMemo(
    () =>
      rewards.filter((r) => sameAddress(isFreelancer ? r.freelancer : r.client, wallet.address)),
    [rewards, isFreelancer, wallet.address],
  );

  // Finished and fully paid agreements whose reward has not been minted yet.
  const claimable = useMemo(() => {
    const rewarded = new Set(rewards.map((r) => r.agreementId));
    return agreements
      .filter((a) => a.status === "Completed" && !rewarded.has(a.id))
      .map((a) => ({ agreement: a, escrow: escrows.find((e) => e.agreementId === a.id) }))
      .filter(({ escrow }) => escrow?.status === "Completed");
  }, [agreements, escrows, rewards]);

  const balance = mine.reduce((s, r) => s + shareOf(r), 0);
  const rate = isFreelancer ? FREELANCER_RATE : CLIENT_RATE;

  async function claim(agreementId: string, onChainId: number) {
    setClaiming(agreementId);
    try {
      await claimReputation(onChainId);
      toast.success("Reputation minted", "FLR tokens sent to the client and the freelancer.");
      await refresh();
    } catch (err) {
      toast.error("Claim failed", (err as Error).message);
    } finally {
      setClaiming(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Rewards"
        description="Soulbound FLR reputation, earned by finishing missions paid through the escrow."
      />

      {rewardsError && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">
          {rewardsError}
        </p>
      )}

      {!live ? (
        <Card>
          <EmptyState
            icon={<Award />}
            title="Rewards live on the blockchain"
            description={
              mode === "chain"
                ? "The ReputationToken contract is not deployed yet. Run npm run deploy:local in the blockchain folder, then reload."
                : "Connect MetaMask on the Hardhat network to see your FLR balance and claim rewards. There are no simulated rewards in demo mode."
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="My reputation"
              value={formatFlr(balance)}
              hint={`${rate} FLR per ETH paid, as ${isFreelancer ? "freelancer" : "client"}`}
              icon={<Award />}
              tint="bg-violet-50 text-violet-600"
            />
            <StatCard
              label="Missions rewarded"
              value={String(mine.length)}
              hint="Completed and fully paid"
              icon={<BadgeCheck />}
              tint="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              label="Ready to claim"
              value={String(claimable.length)}
              hint="Waiting for a claim transaction"
              icon={<Hourglass />}
              tint="bg-amber-50 text-amber-600"
            />
          </div>

          <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <p>
              A smart contract never runs on its own: someone has to send the transaction that mints the reward.
              Either party can do it, once per agreement, and both receive their FLR in the same transaction
              (freelancer {FREELANCER_RATE} FLR per ETH, client {CLIENT_RATE} FLR per ETH).
            </p>
          </div>
          <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
            <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <p>
              Deadline rule: the freelancer gets the full reward only if the work was delivered by the agreement
              deadline. Delivered late, or never delivered, it is cut to {LATE_REWARD_PERCENT}%. The client, who paid in
              full, always gets their full share.
            </p>
          </div>

          <Card className="mt-6">
            <CardHeader title="Ready to claim" description="Completed agreements whose escrow paid the freelancer" />
            {claimable.length === 0 ? (
              <p className="px-5 py-5 text-sm text-slate-500 sm:px-6">Nothing to claim right now.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {claimable.map(({ agreement, escrow }) => {
                  const paid = escrow?.releasedEth ?? 0;
                  const onTime = isDeliveredOnTime(agreement);
                  const expected = expectedRewards(paid, onTime);
                  return (
                    <li key={agreement.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/agreements/${agreement.id}`}
                          className="font-medium text-navy-900 hover:text-brand-600"
                        >
                          {agreement.title}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {agreement.id} · {formatEth(paid)} paid · you will receive{" "}
                          {formatFlr(shareOf(expected))}
                        </p>
                        <DeadlineBadge onTime={onTime} />
                      </div>
                      <Button
                        size="sm"
                        loading={claiming === agreement.id}
                        disabled={claiming !== null}
                        onClick={() => claim(agreement.id, agreement.onChainId)}
                      >
                        <Award className="size-4" aria-hidden /> Claim
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="mt-6">
            <CardHeader title="Reward history" description="Every FLR minted to this wallet" />
            {mine.length === 0 ? (
              <p className="px-5 py-5 text-sm text-slate-500 sm:px-6">No reward yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-3 font-medium sm:px-6">Agreement</th>
                      <th className="px-5 py-3 font-medium">Reward</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Transaction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mine.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 sm:px-6">
                          <Link href={`/agreements/${r.agreementId}`} className="font-medium text-navy-900 hover:text-brand-600">
                            {r.agreementTitle}
                          </Link>
                          <p className="text-xs text-slate-500">{r.agreementId}</p>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="font-medium text-violet-700">+{formatFlr(shareOf(r))}</span>
                          <DeadlineBadge onTime={r.onTime} />
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDateTime(r.date)}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-500">{shortenHash(r.txHash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
