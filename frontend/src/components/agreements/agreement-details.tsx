"use client";

import { use, useEffect, useState } from "react";
import Link from "@/components/space/link";
import { ArrowLeft, CalendarClock, CalendarPlus, Coins, FileSearch, FileText, Hash, LockKeyhole } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AddressAvatar, CopyValue } from "@/components/ui/address";
import { EmptyState, ProgressBar, SimulatedTag, Skeleton } from "@/components/ui/misc";
import { MilestoneBadge, StatusBadge } from "@/components/ui/status-badge";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { useAppStore } from "@/components/providers/app-store";
import { EscrowControls } from "@/components/escrow/escrow-controls";
import { useWallet } from "@/components/wallet/wallet-provider";
import { daysBetween, formatDate, formatDateTime, formatEth, formatUsd } from "@/lib/utils";
import type { Agreement, Party, Role } from "@/types/agreement";
import { AgreementActions } from "./agreement-actions";
import { LifecycleStepper } from "./lifecycle-stepper";

function PartyCard({ role, party, isYou }: { role: string; party: Party; isYou: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{role}</p>
      <div className="mt-3 flex items-center gap-3">
        <AddressAvatar address={party.address} size={40} />
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-navy-900">
            {party.name}
            {isYou && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">You</span>
            )}
          </p>
          {party.title && <p className="truncate text-xs text-slate-500">{party.title}</p>}
        </div>
      </div>
      <CopyValue value={party.address} chars={8} className="mt-3" label="Copy wallet address" />
    </div>
  );
}

function Meta({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 [&_svg]:size-4">
        {icon}
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-navy-900">{children}</dd>
      </div>
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading agreement">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

export function AgreementDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getAgreement, roleFor, milestones, mode, chainStatus, chainError } = useAppStore();
  const wallet = useWallet();
  const agreement = getAgreement(decodeURIComponent(id));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  if (!ready || (!agreement && chainStatus === "loading")) return <DetailsSkeleton />;

  if (!agreement && chainStatus === "error") {
    return (
      <Card>
        <EmptyState
          icon={<FileSearch />}
          title="Could not read the blockchain"
          description={chainError ?? "The blockchain is not reachable."}
          action={<ButtonLink href="/agreements">Back to agreements</ButtonLink>}
        />
      </Card>
    );
  }

  if (!agreement) {
    return (
      <Card>
        <EmptyState
          icon={<FileSearch />}
          title="Agreement not found"
          description={
            mode === "chain"
              ? `No agreement with ID “${decodeURIComponent(id)}” exists on the connected blockchain.`
              : `No agreement with ID “${decodeURIComponent(id)}” exists. Demo agreements created in this session are lost after a full page reload.`
          }
          action={<ButtonLink href="/agreements">Back to agreements</ButtonLink>}
        />
      </Card>
    );
  }

  return <AgreementDetailsContent key={agreement.id} agreement={agreement} actualRole={roleFor(agreement, wallet.address)} milestones={milestones} />;
}

function AgreementDetailsContent({
  agreement,
  actualRole,
  milestones: allMilestones,
}: {
  agreement: Agreement;
  actualRole: Role;
  milestones: ReturnType<typeof useAppStore>["milestones"];
}) {
  const { mode, escrowEnabled, nowMs } = useAppStore();
  const [role, setRole] = useState<Role>(actualRole);
  const now = new Date(nowMs).toISOString();
  const milestones = allMilestones.filter((m) => m.agreementId === agreement.id);
  const released = milestones.filter((m) => m.status === "Released").reduce((s, m) => s + m.amountEth, 0);
  const daysLeft = daysBetween(now, agreement.deadline);
  const nameOf = (address: string) =>
    address === agreement.client.address
      ? agreement.client.name
      : address === agreement.freelancer.address
        ? agreement.freelancer.name
        : undefined;
  const timeline = [...agreement.timeline].reverse();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/agreements"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-navy-900"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to agreements
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-500">{agreement.id}</span>
              <StatusBadge status={agreement.status} />
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-navy-900">{agreement.title}</h1>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-2xl font-semibold tracking-tight text-navy-900">{formatEth(agreement.amountEth)}</p>
            <p className="text-xs text-slate-500">≈ {formatUsd(agreement.amountEth)} (mock rate)</p>
          </div>
        </div>
      </div>

      <Card className="px-5 py-6 sm:px-8">
        <LifecycleStepper agreement={agreement} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Parties" />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <PartyCard role="Client" party={agreement.client} isYou={actualRole === "client"} />
              <PartyCard role="Freelancer" party={agreement.freelancer} isYou={actualRole === "freelancer"} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Scope & terms" />
            <CardBody className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-navy-900">Description</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{agreement.description}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-navy-900">Terms and conditions</h3>
                <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm leading-relaxed whitespace-pre-line text-slate-600">
                  {agreement.terms}
                </p>
              </div>
              {agreement.documentName && (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <FileText className="size-5 text-brand-500" aria-hidden />
                  <span className="flex-1 truncate text-sm font-medium text-navy-900">{agreement.documentName}</span>
                  <span className="text-xs text-slate-400">Attachment</span>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Lifecycle history" description="Every status change is recorded as a contract event." />
            <CardBody>
              <ActivityTimeline items={timeline} simulated={mode === "demo"} resolveName={nameOf} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <AgreementActions agreement={agreement} actualRole={actualRole} role={role} onRoleChange={setRole} />

          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-4">
                <Meta icon={<Coins />} label="Amount">
                  {formatEth(agreement.amountEth)}
                </Meta>
                <Meta icon={<CalendarPlus />} label="Created">
                  {formatDateTime(agreement.createdAt)}
                </Meta>
                <Meta icon={<CalendarClock />} label="Deadline">
                  {formatDate(agreement.deadline)}
                  {!["Completed", "Cancelled"].includes(agreement.status) && (
                    <span className={daysLeft < 0 ? "ml-1.5 text-rose-600" : "ml-1.5 font-normal text-slate-500"}>
                      {daysLeft < 0 ? `(${-daysLeft}d overdue)` : `(${daysLeft}d left)`}
                    </span>
                  )}
                </Meta>
                <Meta icon={<Hash />} label="Creation transaction">
                  <span className="flex flex-wrap items-center gap-2">
                    <CopyValue value={agreement.txHash} chars={6} label="Copy transaction hash" />
                    {mode === "demo" && <SimulatedTag />}
                  </span>
                </Meta>
                <Meta icon={<Hash />} label="Terms hash (keccak256)">
                  <CopyValue value={agreement.termsHash} chars={6} label="Copy terms hash" />
                </Meta>
                <Meta icon={<Hash />} label="On-chain ID">
                  <span className="font-mono text-xs">#{agreement.onChainId}</span>
                </Meta>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Escrow"
              action={
                <Link href="/escrow" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                  Manage
                </Link>
              }
            />
            <CardBody className="space-y-3">
              {milestones.length ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Released</span>
                    <span className="font-medium text-navy-900">
                      {formatEth(released)} / {formatEth(agreement.amountEth)}
                    </span>
                  </div>
                  <ProgressBar value={(released / agreement.amountEth) * 100} label="Escrow released" />
                  <ul className="space-y-2 pt-1">
                    {milestones.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-slate-600">{m.title}</span>
                        <MilestoneBadge status={m.status} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : mode === "demo" || !escrowEnabled ? (
                <p className="flex items-start gap-2 text-sm text-slate-500">
                  <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {mode === "chain"
                    ? "Funds are not held by this contract. Payment is handled by the escrow contract."
                    : "Single payment: the full amount is released when the client approves the delivery."}
                </p>
              ) : null}
              {mode === "chain" && <EscrowControls agreement={agreement} role={actualRole} />}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
