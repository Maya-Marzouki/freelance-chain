"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Banknote, CalendarClock, Check, ChevronDown, Lock, LockKeyhole, Send, Vault } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState, PageHeader, ProgressBar, Segmented } from "@/components/ui/misc";
import { MilestoneBadge, StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import { milestoneAction, type MilestoneAction } from "@/lib/lifecycle";
import { cn, formatDate, formatEth, formatUsd } from "@/lib/utils";
import type { Agreement, Milestone, Role } from "@/types/agreement";

type Perspective = "auto" | "client" | "freelancer";

interface Pending {
  milestone: Milestone;
  agreement: Agreement;
  action: MilestoneAction;
  role: Role;
}

export function EscrowView() {
  const { agreements, milestones, roleFor, performMilestoneAction } = useAppStore();
  const wallet = useWallet();
  const toast = useToast();
  const [perspective, setPerspective] = useState<Perspective>("auto");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);

  const escrows = useMemo(
    () =>
      agreements
        .map((a) => ({ agreement: a, milestones: milestones.filter((m) => m.agreementId === a.id) }))
        .filter((e) => e.milestones.length > 0),
    [agreements, milestones],
  );

  const totals = useMemo(() => {
    let total = 0;
    let released = 0;
    for (const e of escrows) {
      total += e.agreement.amountEth;
      released += e.milestones.filter((m) => m.status === "Released").reduce((s, m) => s + m.amountEth, 0);
    }
    const awaiting = escrows
      .flatMap((e) => e.milestones)
      .filter((m) => m.status === "Submitted")
      .reduce((s, m) => s + m.amountEth, 0);
    return { total, released, locked: total - released, awaiting };
  }, [escrows]);

  const roleOf = (a: Agreement): Role => (perspective === "auto" ? roleFor(a, wallet.address) : perspective);

  async function confirm() {
    if (!pending) return;
    setLoading(true);
    try {
      const actor = pending.role === "client" ? pending.agreement.client.address : pending.agreement.freelancer.address;
      await performMilestoneAction(pending.milestone.id, pending.action, actor);
      toast.success(
        pending.action === "release" ? "Payment released" : "Milestone submitted",
        pending.action === "release"
          ? `${formatEth(pending.milestone.amountEth)} released to ${pending.agreement.freelancer.name} (simulated).`
          : "The client has been asked to review it.",
      );
      setPending(null);
    } catch (err) {
      toast.error("Action failed", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Escrow & Milestones"
        description="Funds are locked per agreement and released milestone by milestone."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm whitespace-nowrap text-slate-500">Acting as</span>
            <Segmented
              label="Simulated role"
              value={perspective}
              onChange={setPerspective}
              options={[
                { value: "auto", label: "My role" },
                { value: "client", label: "Client" },
                { value: "freelancer", label: "Freelancer" },
              ]}
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Escrow Balance"
          value={formatEth(totals.total, 2)}
          hint={`≈ ${formatUsd(totals.total)} across ${escrows.length} agreements`}
          icon={<Vault />}
          tint="bg-navy-900 text-cyan-400"
        />
        <StatCard
          label="Locked"
          value={formatEth(totals.locked, 2)}
          hint="Held until milestones are approved"
          icon={<Lock />}
          tint="bg-brand-50 text-brand-500"
        />
        <StatCard
          label="Released"
          value={formatEth(totals.released, 2)}
          hint={`${Math.round((totals.released / Math.max(totals.total, 1e-9)) * 100)}% of total escrow`}
          icon={<Banknote />}
          tint="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Awaiting Approval"
          value={formatEth(totals.awaiting, 2)}
          hint="Submitted milestones"
          icon={<Send />}
          tint="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="mt-6 space-y-4">
        {escrows.length === 0 && (
          <Card>
            <EmptyState
              icon={<LockKeyhole />}
              title="No escrow yet"
              description="Agreements with milestone-based payments will appear here."
            />
          </Card>
        )}

        {escrows.map(({ agreement, milestones: ms }) => {
          const released = ms.filter((m) => m.status === "Released").reduce((s, m) => s + m.amountEth, 0);
          const doneCount = ms.filter((m) => m.status === "Released").length;
          const isOpen = expanded[agreement.id] ?? ms.some((m) => m.status === "Submitted");
          const role = roleOf(agreement);
          const panelId = `escrow-${agreement.id}`;
          return (
            <Card key={agreement.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [agreement.id]: !isOpen }))}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full cursor-pointer flex-col gap-4 px-5 py-4 text-left transition hover:bg-slate-50/60 sm:px-6 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{agreement.id}</span>
                    <StatusBadge status={agreement.status} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 capitalize">
                      {role}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-semibold text-navy-900">{agreement.title}</p>
                  <p className="text-xs text-slate-500">
                    {agreement.client.name} → {agreement.freelancer.name}
                  </p>
                </div>
                <div className="w-full md:w-64">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-slate-500">
                      {doneCount}/{ms.length} milestones
                    </span>
                    <span className="font-medium text-navy-900">
                      {formatEth(released)} / {formatEth(agreement.amountEth)}
                    </span>
                  </div>
                  <ProgressBar value={(released / agreement.amountEth) * 100} label={`${agreement.title} escrow progress`} />
                </div>
                <ChevronDown
                  className={cn("hidden size-5 shrink-0 text-slate-400 transition-transform md:block", isOpen && "rotate-180")}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <div id={panelId} className="animate-fade-in border-t border-slate-100 bg-slate-50/40 px-5 py-5 sm:px-6">
                  <ol className="space-y-3">
                    {ms.map((m, i) => {
                      const action = milestoneAction(m, role, agreement.status);
                      return (
                        <li
                          key={m.id}
                          className="flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center"
                        >
                          <div
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              m.status === "Released"
                                ? "bg-emerald-500 text-white"
                                : m.status === "Submitted"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-500",
                            )}
                            aria-hidden
                          >
                            {m.status === "Released" ? <Check className="size-4" /> : i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-navy-900">{m.title}</p>
                              <MilestoneBadge status={m.status} />
                            </div>
                            <p className="mt-0.5 text-sm text-slate-500">{m.description}</p>
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                              <CalendarClock className="size-3.5" aria-hidden /> Due {formatDate(m.dueDate)}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                            <p className="text-sm font-semibold text-navy-900">{formatEth(m.amountEth)}</p>
                            {action ? (
                              <Button
                                size="sm"
                                variant={action === "release" ? "primary" : "secondary"}
                                onClick={() => setPending({ milestone: m, agreement, action, role })}
                              >
                                {action === "release" ? (
                                  <>
                                    <Banknote className="size-4" aria-hidden /> Approve & Release
                                  </>
                                ) : (
                                  <>
                                    <Send className="size-4" aria-hidden /> Submit for review
                                  </>
                                )}
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">
                                {m.status === "Released"
                                  ? "Paid out"
                                  : m.status === "Submitted"
                                    ? "Client approval required"
                                    : agreement.status === "Disputed"
                                      ? "Frozen by dispute"
                                      : "Freelancer to submit"}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <Link
                    href={`/agreements/${agreement.id}`}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Open agreement <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!pending}
        onClose={() => !loading && setPending(null)}
        onConfirm={confirm}
        loading={loading}
        title={pending?.action === "release" ? "Approve milestone and release funds?" : "Submit milestone for review?"}
        description={
          pending?.action === "release"
            ? `${formatEth(pending.milestone.amountEth)} will be released from escrow to ${pending.agreement.freelancer.name}. This cannot be undone.`
            : "The client will be notified to review and approve this milestone."
        }
        confirmLabel={pending?.action === "release" ? "Approve & Release" : "Submit"}
        icon={
          pending?.action === "release" ? (
            <Banknote className="text-emerald-500" />
          ) : (
            <Send className="text-brand-500" />
          )
        }
      >
        {pending && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm">
            <p className="font-medium text-navy-900">{pending.milestone.title}</p>
            <p className="text-slate-500">{pending.agreement.title}</p>
            <p className="mt-2 text-xs text-amber-700">Demo mode: simulated transaction, no funds move.</p>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
