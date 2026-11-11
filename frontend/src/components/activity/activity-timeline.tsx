import Link from "@/components/space/link";
import {
  AlertOctagon,
  Award,
  Ban,
  BadgeCheck,
  Banknote,
  FilePlus2,
  Handshake,
  PackageCheck,
  Play,
  Send,
  type LucideIcon,
} from "lucide-react";
import { SimulatedTag } from "@/components/ui/misc";
import { cn, formatDateTime, formatEth, shortenAddress, shortenHash } from "@/lib/utils";
import type { ActivityItem, ActivityType, AgreementEvent } from "@/types/agreement";

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: LucideIcon; tint: string }> = {
  AgreementCreated: { label: "Agreement Created", icon: FilePlus2, tint: "bg-slate-100 text-slate-600" },
  AgreementAccepted: { label: "Agreement Accepted", icon: Handshake, tint: "bg-cyan-50 text-cyan-600" },
  WorkStarted: { label: "Work Started", icon: Play, tint: "bg-brand-50 text-brand-500" },
  DeliverySubmitted: { label: "Delivery Submitted", icon: PackageCheck, tint: "bg-amber-50 text-amber-600" },
  MilestoneSubmitted: { label: "Milestone Submitted", icon: Send, tint: "bg-amber-50 text-amber-600" },
  PaymentReleased: { label: "Payment Released", icon: Banknote, tint: "bg-emerald-50 text-emerald-600" },
  AgreementCompleted: { label: "Agreement Completed", icon: BadgeCheck, tint: "bg-emerald-50 text-emerald-600" },
  AgreementCancelled: { label: "Agreement Cancelled", icon: Ban, tint: "bg-slate-100 text-slate-500" },
  DisputeRaised: { label: "Dispute Raised", icon: AlertOctagon, tint: "bg-rose-50 text-rose-600" },
  ReputationRewarded: { label: "Reputation Rewarded", icon: Award, tint: "bg-violet-50 text-violet-600" },
};

type TimelineItem = AgreementEvent & Partial<Pick<ActivityItem, "agreementId" | "agreementTitle" | "amountEth">>;

interface Props {
  items: TimelineItem[];
  /** Show the agreement title/link on each entry (global feeds). */
  showAgreement?: boolean;
  /** Show transaction hashes. */
  showTx?: boolean;
  compact?: boolean;
  /** Flag transaction hashes as simulated (demo mode). */
  simulated?: boolean;
  resolveName?: (address: string) => string | undefined;
}

export function ActivityTimeline({ items, showAgreement, showTx = true, compact, simulated = true, resolveName }: Props) {
  return (
    <ol className="relative">
      {items.map((item, i) => {
        const meta = ACTIVITY_META[item.type];
        const Icon = meta.icon;
        const last = i === items.length - 1;
        const actor = resolveName?.(item.actor) ?? shortenAddress(item.actor);
        return (
          <li key={item.id} className={cn("relative flex gap-4", last ? "pb-0" : compact ? "pb-5" : "pb-7")}>
            {!last && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-slate-200" aria-hidden />}
            <div className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-full", meta.tint)}>
              <Icon className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium text-navy-900">
                  {meta.label}
                  {item.amountEth !== undefined && (
                    <span className="ml-1.5 font-normal text-slate-500">· {formatEth(item.amountEth)}</span>
                  )}
                </p>
                <time dateTime={item.date} className="text-xs text-slate-400">
                  {formatDateTime(item.date)}
                </time>
              </div>
              {showAgreement && item.agreementId && (
                <Link
                  href={`/agreements/${item.agreementId}`}
                  className="mt-0.5 block truncate text-sm text-slate-600 hover:text-brand-600"
                >
                  {item.agreementTitle} <span className="text-slate-400">· {item.agreementId}</span>
                </Link>
              )}
              <p className="mt-0.5 text-xs text-slate-500">
                by {actor}
                {item.note && <span className="text-slate-600"> — {item.note}</span>}
              </p>
              {showTx && (
                <p className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 ring-1 ring-slate-200 ring-inset">
                    tx {shortenHash(item.txHash)}
                  </span>
                  {simulated && <SimulatedTag />}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
