"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FilePlus2, FileText, Loader, LockKeyhole, Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { STATUS_META } from "@/components/ui/status-badge";
import { AgreementsTable } from "@/components/agreements/agreements-table";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { useAppStore } from "@/components/providers/app-store";
import { useWallet } from "@/components/wallet/wallet-provider";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { AGREEMENT_STATUSES } from "@/types/agreement";
import { cn, formatEth, formatUsd } from "@/lib/utils";
import { StatCard } from "./stat-card";

const ACTIVE = new Set(["Accepted", "InProgress", "Delivered"]);

export function DashboardView() {
  const { agreements, milestones, activity, user } = useAppStore();
  const wallet = useWallet();

  const stats = useMemo(() => {
    const active = agreements.filter((a) => ACTIVE.has(a.status));
    const completed = agreements.filter((a) => a.status === "Completed");
    // Escrow is locked while an agreement is active or disputed, minus released milestones.
    const lockedAgreements = agreements.filter((a) => ACTIVE.has(a.status) || a.status === "Disputed");
    const tvl = lockedAgreements.reduce((sum, a) => {
      const released = milestones
        .filter((m) => m.agreementId === a.id && m.status === "Released")
        .reduce((s, m) => s + m.amountEth, 0);
      return sum + a.amountEth - released;
    }, 0);
    const byStatus = AGREEMENT_STATUSES.map((s) => ({ status: s, count: agreements.filter((a) => a.status === s).length }));
    return { total: agreements.length, active: active.length, completed: completed.length, tvl, byStatus };
  }, [agreements, milestones]);

  const recent = useMemo(
    () => [...agreements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [agreements],
  );

  const nameOf = (address: string) => {
    const a = agreements.find((x) => x.client.address === address || x.freelancer.address === address);
    if (!a) return undefined;
    return a.client.address === address ? a.client.name : a.freelancer.name;
  };

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description="Here's what's happening across your agreements today."
        actions={
          <ButtonLink href="/agreements/create">
            <FilePlus2 className="size-4" aria-hidden /> New Agreement
          </ButtonLink>
        }
      />

      {wallet.status !== "connected" && (
        <Card className="mb-6 flex flex-col gap-4 border-brand-100 bg-gradient-to-r from-brand-50/80 to-white p-5 sm:flex-row sm:items-center">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-500 shadow-card">
            <Wallet className="size-5" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-navy-900">
              {wallet.status === "unavailable" ? "MetaMask is not installed" : "Connect your wallet"}
            </p>
            <p className="text-sm text-slate-600">
              {wallet.status === "unavailable"
                ? "Install MetaMask to sign agreements. You can keep exploring the demo data meanwhile."
                : "Link MetaMask to sign agreements on the Hardhat local network (chain ID 31337)."}
            </p>
          </div>
          <ConnectWallet />
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Agreements" value={stats.total} hint="All time" icon={<FileText />} />
        <StatCard
          label="Active Agreements"
          value={stats.active}
          hint="Accepted, in progress or delivered"
          icon={<Loader />}
          tint="bg-cyan-50 text-cyan-600"
        />
        <StatCard
          label="Completed Agreements"
          value={stats.completed}
          hint={`${Math.round((stats.completed / Math.max(stats.total, 1)) * 100)}% completion rate`}
          icon={<CheckCircle2 />}
          tint="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Total Value Locked"
          value={formatEth(stats.tvl, 2)}
          hint={`≈ ${formatUsd(stats.tvl)} (mock rate)`}
          icon={<LockKeyhole />}
          tint="bg-navy-900 text-cyan-400"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Recent Agreements"
            description="The five most recently created agreements"
            action={
              <Link
                href="/agreements"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <AgreementsTable agreements={recent} compact />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status Overview" />
            <div className="space-y-3 px-5 py-5 sm:px-6">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                {stats.byStatus
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <div
                      key={s.status}
                      className={cn("h-full", STATUS_META[s.status].dot)}
                      style={{ width: `${(s.count / stats.total) * 100}%` }}
                      title={`${STATUS_META[s.status].label}: ${s.count}`}
                    />
                  ))}
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                {stats.byStatus.map((s) => (
                  <li key={s.status} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className={cn("size-2 rounded-full", STATUS_META[s.status].dot)} aria-hidden />
                      {STATUS_META[s.status].label}
                    </span>
                    <span className="font-medium text-navy-900">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Recent Activity"
              action={
                <Link href="/activity" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                  See all
                </Link>
              }
            />
            <div className="px-5 py-5 sm:px-6">
              <ActivityTimeline items={activity.slice(0, 5)} showAgreement showTx={false} compact resolveName={nameOf} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
